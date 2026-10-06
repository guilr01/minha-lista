import "server-only";
import { comoUsuario, type Consulta } from "./db";
import { FAIXAS, type Faixa } from "./faixa";
import { sugerirSlug } from "./slug";

// O cadastro da papelaria: catálogo, escolas, séries, listas e os dados da
// loja. Tudo roda como `authenticated` com o usuário da sessão; quem impede
// mexer na papelaria alheia é o RLS (e as chaves compostas impedem misturar
// o produto de uma com a lista de outra). As regras de status da lista estão
// em publicar_lista / encerrar_lista (migração 0006).

export class ErroDeCadastro extends Error {}

/** Traduz a recusa do banco em algo que a papelaria entende. */
function traduzir(e: unknown): never {
  const err = e as { code?: string; constraint?: string; message?: string };
  const r = err.constraint ?? "";
  // Chave estrangeira recusando a exclusão: 23503 até o Postgres 17; no 18,
  // ON DELETE RESTRICT passou a levantar 23001 (restrict_violation). O Neon é 18.
  const fkRecusou = err.code === "23503" || err.code === "23001";
  if (fkRecusou && r.includes("lista_item") && r.includes("produto")) {
    throw new ErroDeCadastro("Este produto está em uma lista. Desative-o em vez de excluir.");
  }
  if (fkRecusou && r.startsWith("lista_")) {
    throw new ErroDeCadastro("Há listas cadastradas aqui. Exclua as listas em rascunho antes; as que já tiveram pedidos ficam.");
  }
  if (fkRecusou && r.startsWith("pedido_")) {
    throw new ErroDeCadastro("Esta lista já tem pedidos. Encerre-a em vez de excluir.");
  }
  if (err.code === "23505" && r === "lista_serie_id_ano_letivo_key") {
    throw new ErroDeCadastro("Esta série já tem uma lista para esse ano.");
  }
  if (err.code === "23505" && r === "lista_item_lista_id_produto_id_key") {
    throw new ErroDeCadastro("Este produto já está na lista. Ajuste a quantidade dele.");
  }
  const msg = err.message ?? "";
  if (msg.startsWith("lista_vazia")) throw new ErroDeCadastro("Inclua pelo menos um item antes de publicar.");
  if (msg.startsWith("lista_inexistente")) throw new ErroDeCadastro("Lista não encontrada.");
  if (err.code === "23514") throw new ErroDeCadastro("Algum valor está fora do permitido. Confira os campos.");
  throw e;
}

async function rodar<T>(usuarioId: string, fn: (q: Consulta) => Promise<T>): Promise<T> {
  try {
    return await comoUsuario(usuarioId, fn);
  } catch (e) {
    traduzir(e);
  }
}

// ------------------------------------------------------------- catálogo

export type OpcaoDoCadastro = { faixa: Faixa; marca: string; preco_centavos: number; disponivel: boolean };

export type ProdutoDoCadastro = {
  id: string;
  nome: string;
  categoria: string | null;
  unidade: string;
  ativo: boolean;
  opcoes: OpcaoDoCadastro[];
  em_listas: number;
};

const SELECT_PRODUTO = `
  select p.id, p.nome, p.categoria, p.unidade, p.ativo,
         coalesce((select jsonb_agg(jsonb_build_object('faixa', o.faixa, 'marca', o.marca,
                     'preco_centavos', o.preco_centavos, 'disponivel', o.disponivel) order by o.faixa)
                   from public.produto_opcao o where o.produto_id = p.id), '[]'::jsonb) as opcoes,
         (select count(*)::int from public.lista_item li where li.produto_id = p.id) as em_listas
    from public.produto p`;

export async function listarProdutos(usuarioId: string, fornecedorId: string) {
  return rodar(usuarioId, async (q) =>
    (await q<ProdutoDoCadastro>(`${SELECT_PRODUTO} where p.fornecedor_id = $1
      order by p.ativo desc, p.categoria nulls last, p.ordem, p.nome`, [fornecedorId])).rows,
  );
}

export async function buscarProduto(usuarioId: string, id: string) {
  return rodar(usuarioId, async (q) => (await q<ProdutoDoCadastro>(`${SELECT_PRODUTO} where p.id = $1`, [id])).rows[0] ?? null);
}

export type DadosDoProduto = {
  nome: string;
  categoria: string;
  unidade: string;
  ativo: boolean;
  /** Faixa sem marca e preço = a papelaria não vende essa faixa deste item. */
  opcoes: Partial<Record<Faixa, { marca: string; preco_centavos: number; disponivel: boolean }>>;
};

/** Cria (id nulo) ou atualiza um produto e as suas até três opções. */
export async function salvarProduto(usuarioId: string, fornecedorId: string, id: string | null, d: DadosDoProduto) {
  if (d.nome.trim().length < 2) throw new ErroDeCadastro("Informe o nome do produto.");
  if (!FAIXAS.some((f) => d.opcoes[f])) throw new ErroDeCadastro("Cadastre pelo menos uma faixa, com marca e preço.");
  return rodar(usuarioId, async (q) => {
    let produtoId = id;
    if (produtoId) {
      const r = await q(
        `update public.produto set nome = $2, categoria = nullif($3, ''), unidade = $4, ativo = $5 where id = $1`,
        [produtoId, d.nome.trim(), d.categoria.trim(), d.unidade.trim() || "un", d.ativo],
      );
      if (!r.rowCount) throw new ErroDeCadastro("Produto não encontrado.");
    } else {
      const r = await q<{ id: string }>(
        `insert into public.produto (fornecedor_id, nome, categoria, unidade, ativo, ordem)
         values ($1, $2, nullif($3, ''), $4, $5,
                 coalesce((select max(ordem) + 1 from public.produto where fornecedor_id = $1), 0))
         returning id`,
        [fornecedorId, d.nome.trim(), d.categoria.trim(), d.unidade.trim() || "un", d.ativo],
      );
      produtoId = r.rows[0].id;
    }
    for (const f of FAIXAS) {
      const o = d.opcoes[f];
      if (o) {
        await q(
          `insert into public.produto_opcao (fornecedor_id, produto_id, faixa, marca, preco_centavos, disponivel)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (produto_id, faixa) do update
             set marca = excluded.marca, preco_centavos = excluded.preco_centavos, disponivel = excluded.disponivel`,
          [fornecedorId, produtoId, f, o.marca.trim(), o.preco_centavos, o.disponivel],
        );
      } else {
        // Apagar a opção não mexe em pedido nenhum: o item do pedido guarda a
        // cópia, e opcao_id vira nulo.
        await q(`delete from public.produto_opcao where produto_id = $1 and faixa = $2`, [produtoId, f]);
      }
    }
    return produtoId!;
  });
}

export async function excluirProduto(usuarioId: string, id: string) {
  return rodar(usuarioId, async (q) => {
    await q(`delete from public.produto where id = $1`, [id]);
  });
}

// ------------------------------------------------- escolas, séries, listas

export type ResumoDaLista = { id: string; ano_letivo: number; status: "rascunho" | "publicada" | "encerrada"; itens: number; pedidos: number };
export type SerieDoCadastro = { id: string; nome: string; slug: string; ordem: number; listas: ResumoDaLista[] };
export type EscolaDoCadastro = { id: string; nome: string; slug: string; cidade: string | null; series: SerieDoCadastro[] };

export async function listarEscolas(usuarioId: string, fornecedorId: string) {
  return rodar(usuarioId, async (q) =>
    (await q<EscolaDoCadastro>(
      `select e.id, e.nome, e.slug, e.cidade,
              coalesce((select jsonb_agg(jsonb_build_object(
                  'id', s.id, 'nome', s.nome, 'slug', s.slug, 'ordem', s.ordem,
                  'listas', coalesce((select jsonb_agg(jsonb_build_object(
                      'id', l.id, 'ano_letivo', l.ano_letivo, 'status', l.status,
                      'itens', (select count(*) from public.lista_item li where li.lista_id = l.id),
                      'pedidos', (select count(*) from public.pedido pe where pe.lista_id = l.id))
                    order by l.ano_letivo desc) from public.lista l where l.serie_id = s.id), '[]'::jsonb))
                order by s.ordem, s.nome) from public.serie s where s.escola_id = e.id), '[]'::jsonb) as series
         from public.escola e where e.fornecedor_id = $1 order by e.nome`,
      [fornecedorId],
    )).rows,
  );
}

/** Insere tentando o slug sugerido e, se já existir, -2, -3… */
async function inserirComSlug(q: Consulta, nome: string, inserir: (slug: string) => Promise<{ id: string }>) {
  const base = sugerirSlug(nome) || "item";
  for (let i = 1; i <= 20; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    await q("savepoint slug");
    try {
      const r = await inserir(slug);
      await q("release savepoint slug");
      return r;
    } catch (e) {
      await q("rollback to savepoint slug");
      if ((e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new ErroDeCadastro("Não foi possível gerar um endereço para este nome.");
}

export async function criarEscola(usuarioId: string, fornecedorId: string, nome: string, cidade: string) {
  if (nome.trim().length < 2) throw new ErroDeCadastro("Informe o nome da escola.");
  return rodar(usuarioId, (q) =>
    inserirComSlug(q, nome, async (slug) =>
      (await q<{ id: string }>(
        `insert into public.escola (fornecedor_id, nome, slug, cidade) values ($1, $2, $3, nullif($4, '')) returning id`,
        [fornecedorId, nome.trim(), slug, cidade.trim()],
      )).rows[0],
    ),
  );
}

export async function excluirEscola(usuarioId: string, id: string) {
  return rodar(usuarioId, async (q) => {
    // Escola com série que tem lista: as listas seguram (on delete restrict).
    await q(`delete from public.escola where id = $1`, [id]);
  });
}

export async function criarSerie(usuarioId: string, fornecedorId: string, escolaId: string, nome: string) {
  if (!nome.trim()) throw new ErroDeCadastro("Informe o nome da série.");
  return rodar(usuarioId, (q) =>
    inserirComSlug(q, nome, async (slug) =>
      (await q<{ id: string }>(
        `insert into public.serie (fornecedor_id, escola_id, nome, slug, ordem)
         values ($1, $2, $3, $4, coalesce((select max(ordem) + 1 from public.serie where escola_id = $2), 0))
         returning id`,
        [fornecedorId, escolaId, nome.trim(), slug],
      )).rows[0],
    ),
  );
}

export async function excluirSerie(usuarioId: string, id: string) {
  return rodar(usuarioId, async (q) => {
    await q(`delete from public.serie where id = $1`, [id]);
  });
}

export async function criarLista(usuarioId: string, fornecedorId: string, serieId: string, ano: number) {
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) throw new ErroDeCadastro("Ano letivo inválido.");
  return rodar(usuarioId, async (q) =>
    (await q<{ id: string }>(
      `insert into public.lista (fornecedor_id, serie_id, ano_letivo) values ($1, $2, $3) returning id`,
      [fornecedorId, serieId, ano],
    )).rows[0].id,
  );
}

/** Nova lista copiando os itens de outra (a de 2026 vira o rascunho de 2027). */
export async function copiarLista(usuarioId: string, fornecedorId: string, origemId: string, ano: number) {
  return rodar(usuarioId, async (q) => {
    const o = await q<{ serie_id: string; observacoes: string | null }>(`select serie_id, observacoes from public.lista where id = $1`, [origemId]);
    if (!o.rows[0]) throw new ErroDeCadastro("Lista não encontrada.");
    const nova = await q<{ id: string }>(
      `insert into public.lista (fornecedor_id, serie_id, ano_letivo, observacoes) values ($1, $2, $3, $4) returning id`,
      [fornecedorId, o.rows[0].serie_id, ano, o.rows[0].observacoes],
    );
    await q(
      `insert into public.lista_item (fornecedor_id, lista_id, produto_id, quantidade, observacao, ordem)
       select fornecedor_id, $2, produto_id, quantidade, observacao, ordem from public.lista_item where lista_id = $1`,
      [origemId, nova.rows[0].id],
    );
    return nova.rows[0].id;
  });
}

export type ListaDoEditor = {
  id: string;
  ano_letivo: number;
  status: "rascunho" | "publicada" | "encerrada";
  observacoes: string | null;
  serie: { id: string; nome: string; slug: string };
  escola: { id: string; nome: string; slug: string };
  pedidos: number;
  itens: { id: string; produto_id: string; nome: string; ativo: boolean; quantidade: number; observacao: string | null }[];
};

export async function buscarListaDoEditor(usuarioId: string, id: string) {
  return rodar(usuarioId, async (q) =>
    (await q<ListaDoEditor>(
      `select l.id, l.ano_letivo, l.status, l.observacoes,
              jsonb_build_object('id', s.id, 'nome', s.nome, 'slug', s.slug) as serie,
              jsonb_build_object('id', e.id, 'nome', e.nome, 'slug', e.slug) as escola,
              (select count(*)::int from public.pedido pe where pe.lista_id = l.id) as pedidos,
              coalesce((select jsonb_agg(jsonb_build_object(
                  'id', li.id, 'produto_id', p.id, 'nome', p.nome, 'ativo', p.ativo,
                  'quantidade', li.quantidade, 'observacao', li.observacao) order by li.ordem, p.nome)
                from public.lista_item li join public.produto p on p.id = li.produto_id
               where li.lista_id = l.id), '[]'::jsonb) as itens
         from public.lista l
         join public.serie s on s.id = l.serie_id
         join public.escola e on e.id = s.escola_id
        where l.id = $1`,
      [id],
    )).rows[0] ?? null,
  );
}

export async function salvarObservacoes(usuarioId: string, listaId: string, texto: string) {
  return rodar(usuarioId, async (q) => {
    await q(`update public.lista set observacoes = nullif($2, '') where id = $1`, [listaId, texto.trim()]);
  });
}

function validarQuantidade(qtd: number) {
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 99) throw new ErroDeCadastro("Quantidade de 1 a 99.");
}

export async function adicionarItem(usuarioId: string, fornecedorId: string, listaId: string, produtoId: string, qtd: number, obs: string) {
  validarQuantidade(qtd);
  return rodar(usuarioId, async (q) => {
    await q(
      `insert into public.lista_item (fornecedor_id, lista_id, produto_id, quantidade, observacao, ordem)
       values ($1, $2, $3, $4, nullif($5, ''),
               coalesce((select max(ordem) + 1 from public.lista_item where lista_id = $2), 0))`,
      [fornecedorId, listaId, produtoId, qtd, obs.trim()],
    );
  });
}

export async function alterarItem(usuarioId: string, itemId: string, qtd: number, obs: string) {
  validarQuantidade(qtd);
  return rodar(usuarioId, async (q) => {
    await q(`update public.lista_item set quantidade = $2, observacao = nullif($3, '') where id = $1`, [itemId, qtd, obs.trim()]);
  });
}

export async function removerItem(usuarioId: string, itemId: string) {
  return rodar(usuarioId, async (q) => {
    await q(`delete from public.lista_item where id = $1`, [itemId]);
  });
}

export async function publicarLista(usuarioId: string, listaId: string) {
  return rodar(usuarioId, async (q) =>
    (await q<{ r: { lista_id: string; encerrou: string | null } }>(`select public.publicar_lista($1) as r`, [listaId])).rows[0].r,
  );
}

export async function encerrarLista(usuarioId: string, listaId: string) {
  return rodar(usuarioId, async (q) => {
    await q(`select public.encerrar_lista($1)`, [listaId]);
  });
}

/** Só rascunho sem pedido some; o resto se encerra (e o banco segura se tiver pedido). */
export async function excluirLista(usuarioId: string, listaId: string) {
  return rodar(usuarioId, async (q) => {
    const r = await q(`delete from public.lista where id = $1 and status = 'rascunho'`, [listaId]);
    if (!r.rowCount) throw new ErroDeCadastro("Só dá para excluir lista em rascunho. Encerre-a em vez disso.");
  });
}

// ------------------------------------------------------------------ loja

export type DadosDaLoja = {
  nome: string;
  slug: string;
  whatsapp: string | null;
  endereco_retirada: string | null;
  aceita_entrega: boolean;
  aceita_retirada: boolean;
  taxa_entrega_centavos: number;
  parcelas_maximas: number;
};

export async function buscarLoja(usuarioId: string, fornecedorId: string) {
  return rodar(usuarioId, async (q) =>
    (await q<DadosDaLoja>(
      `select nome, slug, whatsapp, endereco_retirada, aceita_entrega, aceita_retirada,
              taxa_entrega_centavos, parcelas_maximas from public.fornecedor where id = $1`,
      [fornecedorId],
    )).rows[0] ?? null,
  );
}

export async function salvarLoja(usuarioId: string, fornecedorId: string, d: Omit<DadosDaLoja, "slug">) {
  if (d.nome.trim().length < 2) throw new ErroDeCadastro("Informe o nome da papelaria.");
  if (!d.aceita_entrega && !d.aceita_retirada) throw new ErroDeCadastro("Marque entrega, retirada ou as duas.");
  if (d.whatsapp && !/^\d{10,13}$/.test(d.whatsapp)) throw new ErroDeCadastro("WhatsApp com DDD, só números.");
  if (!Number.isInteger(d.parcelas_maximas) || d.parcelas_maximas < 1 || d.parcelas_maximas > 12) {
    throw new ErroDeCadastro("Parcelas de 1 a 12.");
  }
  return rodar(usuarioId, async (q) => {
    await q(
      `update public.fornecedor
          set nome = $2, whatsapp = $3, endereco_retirada = nullif($4, ''), aceita_entrega = $5,
              aceita_retirada = $6, taxa_entrega_centavos = $7, parcelas_maximas = $8
        where id = $1`,
      [fornecedorId, d.nome.trim(), d.whatsapp, d.endereco_retirada?.trim() ?? "", d.aceita_entrega,
        d.aceita_retirada, d.taxa_entrega_centavos, d.parcelas_maximas],
    );
  });
}
