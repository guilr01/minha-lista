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
    const id = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Caderno", categoria: "Cadernos", unidade: "un", ativo: true, opcoes: opcoes(790, 1490) });
    let lido = await cad.buscarProduto(p.usuario, id);
    expect(lido?.opcoes.map((o) => [o.faixa, o.preco_centavos])).toEqual([["economica", 790], ["intermediaria", 1490]]);
    await cad.salvarProduto(p.usuario, p.fornecedor, id, { nome: "Caderno 96 fls", categoria: "", unidade: "", ativo: true, opcoes: opcoes(850) });
    lido = await cad.buscarProduto(p.usuario, id);
    expect(lido).toMatchObject({ nome: "Caderno 96 fls", categoria: null, unidade: "un" });
    expect(lido?.opcoes.map((o) => [o.faixa, o.preco_centavos])).toEqual([["economica", 850]]);
  });

  it("produto sem nenhuma faixa é recusado", async () => {
    const p = await papelariaNova();
    await expect(cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Nada", categoria: "", unidade: "un", ativo: true, opcoes: {} }))
      .rejects.toThrow(/pelo menos uma faixa/);
  });

  it("produto que está numa lista não se exclui, com mensagem que diz o que fazer", async () => {
    const p = await papelariaNova();
    const prod = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Lápis", categoria: "", unidade: "un", ativo: true, opcoes: opcoes(120) });
    const escola = await cad.criarEscola(p.usuario, p.fornecedor, "Escola X", "");
    const serie = await cad.criarSerie(p.usuario, p.fornecedor, escola.id, "1º ano");
    const lista = await cad.criarLista(p.usuario, p.fornecedor, serie.id, 2027);
    await cad.adicionarItem(p.usuario, p.fornecedor, lista, prod, 6, "");
    await expect(cad.excluirProduto(p.usuario, prod)).rejects.toThrow(/Desative-o/);
  });

  it("outra papelaria não edita o produto: para ela, ele não existe", async () => {
    const a = await papelariaNova();
    const b = await papelariaNova();
    const id = await cad.salvarProduto(a.usuario, a.fornecedor, null, { nome: "Borracha", categoria: "", unidade: "un", ativo: true, opcoes: opcoes(150) });
    await expect(cad.salvarProduto(b.usuario, b.fornecedor, id, { nome: "Tomada", categoria: "", unidade: "un", ativo: true, opcoes: opcoes(1) }))
      .rejects.toThrow(/não encontrado/);
    expect(await cad.buscarProduto(b.usuario, id)).toBeNull();
    expect((await cad.buscarProduto(a.usuario, id))?.nome).toBe("Borracha");
  });

  it("nem com o id da papelaria alheia: o RLS recusa a escrita", async () => {
    const b = await papelariaNova();
    await expect(cad.salvarProduto(b.usuario, PAPELARIA_CENTRAL, null, { nome: "Intruso", categoria: "", unidade: "un", ativo: true, opcoes: opcoes(100) }))
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
    const prod = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Cola", categoria: "", unidade: "un", ativo: true, opcoes: opcoes(350) });
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
    const prod = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Régua", categoria: "", unidade: "un", ativo: true, opcoes: opcoes(250) });
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
    const base = { nome: "Papelaria Nova", whatsapp: "11988887777", endereco_retirada: "Rua A, 1", aceita_entrega: true, aceita_retirada: false, taxa_entrega_centavos: 1200, parcelas_maximas: 4 };
    await cad.salvarLoja(p.usuario, p.fornecedor, base);
    expect(await cad.buscarLoja(p.usuario, p.fornecedor)).toMatchObject(base);
    await expect(cad.salvarLoja(p.usuario, p.fornecedor, { ...base, aceita_entrega: false })).rejects.toThrow(/entrega, retirada/);
    await expect(cad.salvarLoja(p.usuario, p.fornecedor, { ...base, whatsapp: "123" })).rejects.toThrow(/WhatsApp/);
  });
});

describe("exclusões barradas pelo banco viram mensagem", () => {
  it("série com lista e lista com pedido explicam o que fazer, no Postgres 16 e no 18", async () => {
    const p = await papelariaNova();
    const prod = await cad.salvarProduto(p.usuario, p.fornecedor, null, { nome: "Tesoura", categoria: "", unidade: "un", ativo: true, opcoes: opcoes(690) });
    const e = await cad.criarEscola(p.usuario, p.fornecedor, "Escola W", "");
    const s = await cad.criarSerie(p.usuario, p.fornecedor, e.id, "1º ano");
    const l = await cad.criarLista(p.usuario, p.fornecedor, s.id, 2027);
    await cad.adicionarItem(p.usuario, p.fornecedor, l, prod, 1, "");
    await expect(cad.excluirSerie(p.usuario, s.id)).rejects.toThrow(cad.ErroDeCadastro);
    await expect(cad.excluirEscola(p.usuario, e.id)).rejects.toThrow(cad.ErroDeCadastro);
  });
});
