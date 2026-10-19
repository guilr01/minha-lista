import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAPELARIA_CENTRAL } from "./sessao";
import { urlDoBanco } from "./setup-global";

// As funções de src/lib/cadastro.ts, pelo db.ts de verdade, contra o banco de
// teste. Gravam de verdade: cada teste cria a própria papelaria e usa nomes
// únicos, e nenhum supõe o estado deixado por outro arquivo.

let cad: typeof import("@/lib/cadastro");
const sufixo = Date.now().toString(36);
let n = 0;

async function papelariaNova() {
  n += 1;
  const c = new pg.Client({ connectionString: urlDoBanco() });
  await c.connect();
  const u = await c.query<{ id: string }>(`insert into app.usuario (email) values ($1) returning id`, [`cad-${sufixo}-${n}@exemplo.test`]);
  const f = await c.query<{ id: string }>(`insert into public.fornecedor (nome, slug) values ($1, $2) returning id`, [`Papelaria ${n}`, `cad-${sufixo}-${n}`]);
  await c.query(`insert into public.membro_fornecedor (fornecedor_id, user_id) values ($1, $2)`, [f.rows[0].id, u.rows[0].id]);
  await c.end();
  return { usuario: u.rows[0].id, fornecedor: f.rows[0].id };
}

const opcoes = (e: number, i?: number) => ({
  economica: { marca: "Básica", preco_centavos: e, disponivel: true },
  ...(i ? { intermediaria: { marca: "Boa", preco_centavos: i, disponivel: true } } : {}),
});

beforeAll(async () => {
  process.env.DATABASE_URL = urlDoBanco();
  cad = await import("@/lib/cadastro");
});
afterAll(async () => {
  await globalThis.__poolListaPronta?.end();
  globalThis.__poolListaPronta = undefined;
});

describe("catálogo", () => {
  it("cria, edita e tira uma faixa de um produto", async () => {
    const p = await papelariaNova();
    const id = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Caderno", ativo: true, opcoes: opcoes(790, 1490) });
    let lido = await cad.buscarProduto(p.usuario, id);
    expect(lido?.opcoes.map((o) => [o.faixa, o.preco_centavos])).toEqual([["economica", 790], ["intermediaria", 1490]]);
    await cad.salvarProduto(p.usuario, p.fornecedor, id, { nome: "Caderno 96 fls", ativo: true, opcoes: opcoes(850) });
    lido = await cad.buscarProduto(p.usuario, id);
    expect(lido).toMatchObject({ nome: "Caderno 96 fls" });
    expect(lido?.opcoes.map((o) => [o.faixa, o.preco_centavos])).toEqual([["economica", 850]]);
  });

  it("produto sem nenhuma faixa é recusado", async () => {
    const p = await papelariaNova();
    await expect(cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Nada", ativo: true, opcoes: {} }))
      .rejects.toThrow(/pelo menos uma faixa/);
  });

  it("produto que está numa lista não se exclui, com mensagem que diz o que fazer", async () => {
    const p = await papelariaNova();
    const prod = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Lápis", ativo: true, opcoes: opcoes(120) });
    const escola = await cad.criarEscola(p.usuario, p.fornecedor, "Escola X", "");
    const serie = await cad.criarSerie(p.usuario, p.fornecedor, escola.id, "1º ano");
    const lista = await cad.criarLista(p.usuario, p.fornecedor, serie.id, 2027);
    await cad.adicionarItem(p.usuario, p.fornecedor, lista, prod, 6, "");
    await expect(cad.excluirProduto(p.usuario, prod)).rejects.toThrow(/Desative-o/);
  });

  it("outra papelaria não edita o produto: para ela, ele não existe", async () => {
    const a = await papelariaNova();
    const b = await papelariaNova();
    const id = await cad.salvarProduto(a.usuario, a.fornecedor, null, { nome: "Borracha", ativo: true, opcoes: opcoes(150) });
    await expect(cad.salvarProduto(b.usuario, b.fornecedor, id, { nome: "Tomada", ativo: true, opcoes: opcoes(1) }))
      .rejects.toThrow(/não encontrado/);
    expect(await cad.buscarProduto(b.usuario, id)).toBeNull();
    expect((await cad.buscarProduto(a.usuario, id))?.nome).toBe("Borracha");
  });

  it("nem com o id da papelaria alheia: o RLS recusa a escrita", async () => {
    const b = await papelariaNova();
    await expect(cad.salvarProduto(b.usuario, PAPELARIA_CENTRAL, null, { nome: "Intruso", ativo: true, opcoes: opcoes(100) }))
      .rejects.toThrow(/row-level security/);
  });
});

describe("escolas, séries e listas", () => {
  it("o endereço vem do nome, sem o ordinal, e repetido vira -2", async () => {
    const p = await papelariaNova();
    const e1 = await cad.criarEscola(p.usuario, p.fornecedor, "Colégio São Paulo", "SP");
    const e2 = await cad.criarEscola(p.usuario, p.fornecedor, "Colégio São Paulo", "SP");
    await cad.criarSerie(p.usuario, p.fornecedor, e1.id, "3º ano");
    const escolas = await cad.listarEscolas(p.usuario, p.fornecedor);
    expect(escolas.map((e) => e.slug).sort()).toEqual(["colegio-sao-paulo", "colegio-sao-paulo-2"]);
    expect(escolas.find((e) => e.id === e1.id)?.series[0].slug).toBe("3-ano");
    expect(e2.id).not.toBe(e1.id);
  });

  it("copiar a lista de um ano para o seguinte leva itens e recado", async () => {
    const p = await papelariaNova();
    const prod = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Cola", ativo: true, opcoes: opcoes(350) });
    const e = await cad.criarEscola(p.usuario, p.fornecedor, "Escola Y", "");
    const s = await cad.criarSerie(p.usuario, p.fornecedor, e.id, "2º ano");
    const l26 = await cad.criarLista(p.usuario, p.fornecedor, s.id, 2026);
    await cad.adicionarItem(p.usuario, p.fornecedor, l26, prod, 2, "branca");
    await cad.salvarObservacoes(p.usuario, l26, "Avental na escola");
    const l27 = await cad.copiarLista(p.usuario, p.fornecedor, l26, 2027);
    const lida = await cad.buscarListaDoEditor(p.usuario, l27);
    expect(lida).toMatchObject({ ano_letivo: 2027, status: "rascunho", observacoes: "Avental na escola" });
    expect(lida?.itens.map((i) => [i.nome, i.quantidade, i.observacao])).toEqual([["Cola", 2, "branca"]]);
    await expect(cad.copiarLista(p.usuario, p.fornecedor, l26, 2027)).rejects.toThrow(/já tem uma lista para esse ano/);
  });

  it("item repetido, quantidade fora de 1 a 99; publicar e só excluir rascunho", async () => {
    const p = await papelariaNova();
    const prod = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Régua", ativo: true, opcoes: opcoes(250) });
    const e = await cad.criarEscola(p.usuario, p.fornecedor, "Escola Z", "");
    const s = await cad.criarSerie(p.usuario, p.fornecedor, e.id, "5º ano");
    const l = await cad.criarLista(p.usuario, p.fornecedor, s.id, 2027);
    await expect(cad.publicarLista(p.usuario, l)).rejects.toThrow(/pelo menos um item/);
    await cad.adicionarItem(p.usuario, p.fornecedor, l, prod, 1, "");
    await expect(cad.adicionarItem(p.usuario, p.fornecedor, l, prod, 1, "")).rejects.toThrow(/já está na lista/);
    await expect(cad.adicionarItem(p.usuario, p.fornecedor, l, prod, 100, "")).rejects.toThrow(/1 a 99/);
    expect(await cad.publicarLista(p.usuario, l)).toMatchObject({ lista_id: l, encerrou: null });
    await expect(cad.excluirLista(p.usuario, l)).rejects.toThrow(/Só dá para excluir lista em rascunho/);
  });
});

describe("loja", () => {
  it("salva e valida os dados que os pais veem", async () => {
    const p = await papelariaNova();
    const base = { nome: "Papelaria Nova", whatsapp: "11988887777", endereco_retirada: "Rua A, 1", aceita_entrega: true, aceita_retirada: false, taxa_entrega_centavos: 1200, parcelas_maximas: 4, descontos: {} };
    await cad.salvarLoja(p.usuario, p.fornecedor, base);
    expect(await cad.buscarLoja(p.usuario, p.fornecedor)).toMatchObject(base);
    await expect(cad.salvarLoja(p.usuario, p.fornecedor, { ...base, aceita_entrega: false })).rejects.toThrow(/entrega, retirada/);
    await expect(cad.salvarLoja(p.usuario, p.fornecedor, { ...base, whatsapp: "123" })).rejects.toThrow(/WhatsApp/);
  });

  it("guarda as regras de desconto, e o banco recusa regra malformada mesmo vinda por fora da tela", async () => {
    const p = await papelariaNova();
    const base = { nome: "Papelaria Nova", whatsapp: null, endereco_retirada: "", aceita_entrega: true, aceita_retirada: true, taxa_entrega_centavos: 0, parcelas_maximas: 3 };
    const descontos = {
      lista_completa: { ativo: true, percentual: 5 },
      pix: { ativo: false, percentual: 3 },
      valor_minimo: { ativo: true, percentual: 2, minimo_centavos: 30000 },
      faixa: { ativo: true, percentual: 4, faixa: "premium" as const },
    };
    await cad.salvarLoja(p.usuario, p.fornecedor, { ...base, descontos });
    expect((await cad.buscarLoja(p.usuario, p.fornecedor))?.descontos).toEqual(descontos);
    await expect(cad.salvarLoja(p.usuario, p.fornecedor, { ...base, descontos: { pix: { ativo: true, percentual: 60 } } })).rejects.toThrow(/1% a 50%/);

    const c = new pg.Client({ connectionString: urlDoBanco() });
    await c.connect();
    try {
      for (const ruim of [{ pix: { ativo: true, percentual: 2.5 } }, { frete: { ativo: true, percentual: 5 } },
        { faixa: { ativo: true, percentual: 5, faixa: "ouro" } }, { valor_minimo: { ativo: true, percentual: 5 } }]) {
        await expect(c.query("update public.fornecedor set descontos = $2 where id = $1", [p.fornecedor, JSON.stringify(ruim)]), JSON.stringify(ruim))
          .rejects.toThrow(/descontos_check|check constraint/);
      }
    } finally {
      await c.end();
    }
  });
});

describe("exclusões barradas pelo banco viram mensagem", () => {
  it("série com lista e lista com pedido explicam o que fazer, no Postgres 16 e no 18", async () => {
    const p = await papelariaNova();
    const prod = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Tesoura", ativo: true, opcoes: opcoes(690) });
    const e = await cad.criarEscola(p.usuario, p.fornecedor, "Escola W", "");
    const s = await cad.criarSerie(p.usuario, p.fornecedor, e.id, "1º ano");
    const l = await cad.criarLista(p.usuario, p.fornecedor, s.id, 2027);
    await cad.adicionarItem(p.usuario, p.fornecedor, l, prod, 1, "");
    await expect(cad.excluirSerie(p.usuario, s.id)).rejects.toThrow(cad.ErroDeCadastro);
    await expect(cad.excluirEscola(p.usuario, e.id)).rejects.toThrow(cad.ErroDeCadastro);
  });
});

describe("importação do catálogo pela planilha", () => {
  const linha = (nome: string, economica?: number, premium?: number) => ({
    linha: 2, nome,
    opcoes: {
      ...(economica ? { economica: { marca: "Básica", preco_centavos: economica } } : {}),
      ...(premium ? { premium: { marca: "Top", preco_centavos: premium } } : {}),
    },
  });

  it("cria o que é novo, atualiza pelo nome e não apaga nada", async () => {
    const p = await papelariaNova();
    const fica = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Fica como está", ativo: true, opcoes: opcoes(100) });
    const muda = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Caderno Universitário", ativo: true, opcoes: opcoes(900, 1500) });

    const r = await cad.importarCatalogo(p.usuario, p.fornecedor, [
      linha("caderno  universitario", 990, 2500),
      linha("Lápis", 150),
    ]);
    expect(r).toEqual({ criados: 1, atualizados: 1 });

    const todos = await cad.listarProdutos(p.usuario, p.fornecedor);
    expect(todos).toHaveLength(3);
    expect(todos.find((x) => x.id === fica)?.opcoes.map((o) => o.preco_centavos)).toEqual([100]);
    const atualizado = todos.find((x) => x.id === muda)!;
    // A intermediária, em branco na planilha, fica como estava.
    expect(atualizado).toMatchObject({ nome: "caderno  universitario" });
    expect(atualizado.opcoes.map((o) => [o.faixa, o.marca, o.preco_centavos])).toEqual([
      ["economica", "Básica", 990], ["intermediaria", "Boa", 1500], ["premium", "Top", 2500],
    ]);
    expect(todos.find((x) => x.nome === "Lápis")?.opcoes.map((o) => o.preco_centavos)).toEqual([150]);
  });

  it("é tudo ou nada: um erro no banco desfaz a importação inteira", async () => {
    const p = await papelariaNova();
    await expect(cad.importarCatalogo(p.usuario, p.fornecedor, [
      linha("Bom", 100),
      { ...linha("Ruim", 100), opcoes: { economica: { marca: "x".repeat(81), preco_centavos: 100 } } },
    ])).rejects.toThrow();
    expect(await cad.listarProdutos(p.usuario, p.fornecedor)).toEqual([]);
  });

  it("não grava no catálogo de outra papelaria, nem casando o nome", async () => {
    const a = await papelariaNova();
    const b = await papelariaNova();
    await cad.salvarProduto(b.usuario, b.fornecedor, null, { nome: "Borracha", ativo: true, opcoes: opcoes(300) });
    // A pessoa de A tenta importar para o fornecedor de B: o RLS recusa.
    await expect(cad.importarCatalogo(a.usuario, b.fornecedor, [linha("Borracha", 1)])).rejects.toThrow();
    const deB = await cad.listarProdutos(b.usuario, b.fornecedor);
    expect(deB.map((x) => x.opcoes[0].preco_centavos)).toEqual([300]);
  });
});
