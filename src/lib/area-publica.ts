import "server-only";
import { cache } from "react";
import { comoPai, comoSistema } from "./db";
import { provedorDePagamento } from "./pagamento";
import type { PedidoPublico, ProdutoDoCatalogo, VitrineLista, VitrinePapelaria } from "./vitrine";

// Tudo que a área do pai lê e faz. Leitura pelo papel `anon`, que só alcança
// as funções públicas; o registro da cobrança é do sistema.

export const buscarPapelaria = cache(async (slug: string) =>
  comoPai(async (q) => {
    const r = await q<{ v: VitrinePapelaria | null }>("select public.vitrine_papelaria($1) as v", [slug]);
    return r.rows[0].v;
  }),
);

export async function buscarLista(slug: string, escola: string, serie: string) {
  return comoPai(async (q) => {
    const r = await q<{ v: VitrineLista | null }>("select public.vitrine_lista($1, $2, $3) as v", [slug, escola, serie]);
    return r.rows[0].v;
  });
}

export async function buscarCatalogo(slug: string) {
  return comoPai(async (q) => {
    const r = await q<{ v: ProdutoDoCatalogo[] }>("select public.vitrine_catalogo($1) as v", [slug]);
    return r.rows[0].v;
  });
}

export const buscarPedido = cache(async (token: string) => {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return comoPai(async (q) => {
    const r = await q<{ p: PedidoPublico | null }>("select public.pedido_por_token($1) as p", [token]);
    return r.rows[0].p;
  });
});

export type EntradaDoPedido = {
  lista_id: string;
  faixa_base: string;
  metodo_pagamento: "pix" | "cartao";
  parcelas: number;
  modalidade: "entrega" | "retirada";
  aluno_nome: string;
  responsavel_nome: string;
  responsavel_whatsapp: string;
  endereco?: { cep: string; logradouro: string; numero: string; complemento?: string; bairro?: string; cidade?: string };
  itens: { produto_id: string; faixa: string; quantidade: number }[];
  total_esperado_centavos: number;
};

export async function criarPedido(e: EntradaDoPedido) {
  return comoPai(async (q) => {
    const r = await q<{ r: { token: string; numero: number; total_centavos: number } }>(
      "select public.criar_pedido($1) as r",
      [JSON.stringify(e)],
    );
    return r.rows[0].r;
  });
}

/**
 * Pede a cobrança ao provedor e a registra. Se o pedido já tem cobrança
 * pendente, devolve a existente: chamar duas vezes não cobra duas vezes.
 */
export async function gerarCobranca(token: string, origem: string) {
  const provedor = provedorDePagamento();
  const atual = await comoSistema(async (q) => {
    const r = await q<{
      status: string;
      numero: number;
      total_centavos: number;
      metodo_pagamento: "pix" | "cartao";
      parcelas: number;
      responsavel_nome: string;
      responsavel_whatsapp: string;
      papelaria: string;
      dados_pendente: { urlCartao?: string } | null;
    }>(
      `select pe.status, pe.numero, pe.total_centavos, pe.metodo_pagamento, pe.parcelas,
              pe.responsavel_nome, pe.responsavel_whatsapp, f.nome as papelaria,
              (select pg.dados from public.pagamento pg
                where pg.pedido_id = pe.id and pg.status = 'pendente'
                order by pg.criado_em desc limit 1) as dados_pendente
         from public.pedido pe join public.fornecedor f on f.id = pe.fornecedor_id
        where pe.token = $1`,
      [token],
    );
    return r.rows[0] ?? null;
  });
  if (!atual) throw new Error("pedido_inexistente");
  if (atual.dados_pendente) return { urlCartao: atual.dados_pendente.urlCartao ?? null };
  if (atual.status !== "aguardando_pagamento") return { urlCartao: null };

  const cobranca = await provedor.criarCobranca({
    referencia: `pedido-${atual.numero}`,
    descricao: `${atual.papelaria} · pedido #${atual.numero}`,
    valorCentavos: atual.total_centavos,
    metodo: atual.metodo_pagamento,
    parcelas: atual.parcelas,
    pagador: { nome: atual.responsavel_nome, whatsapp: atual.responsavel_whatsapp },
    urlRetorno: `${origem}/pedido/${token}`,
  });
  const dados = { ...(cobranca.pix ?? {}), ...(cobranca.urlCartao ? { urlCartao: cobranca.urlCartao } : {}) };
  await comoSistema((q) =>
    q("select app.registrar_cobranca($1, $2, $3, $4, $5, $6)", [
      token,
      provedor.nome,
      atual.metodo_pagamento,
      cobranca.idExterno,
      atual.parcelas,
      JSON.stringify(dados),
    ]),
  );
  return { urlCartao: cobranca.urlCartao ?? null };
}

/** Para a página falsa do cartão: de qual pedido é esta cobrança? */
export async function tokenDaCobranca(provedor: string, idExterno: string) {
  return comoSistema(async (q) => {
    const r = await q<{ token: string; total_centavos: number; parcelas: number; papelaria: string; numero: number }>(
      `select pe.token, pe.total_centavos, pe.parcelas, f.nome as papelaria, pe.numero
         from public.pagamento pg
         join public.pedido pe on pe.id = pg.pedido_id
         join public.fornecedor f on f.id = pe.fornecedor_id
        where pg.provedor = $1 and pg.id_externo = $2`,
      [provedor, idExterno],
    );
    return r.rows[0] ?? null;
  });
}

/** O id externo da cobrança pendente do pedido (simulação do falso). */
export async function cobrancaPendente(token: string) {
  return comoSistema(async (q) => {
    const r = await q<{ provedor: string; id_externo: string }>(
      `select pg.provedor, pg.id_externo from public.pagamento pg
         join public.pedido pe on pe.id = pg.pedido_id
        where pe.token = $1 and pg.status = 'pendente'
        order by pg.criado_em desc limit 1`,
      [token],
    );
    return r.rows[0] ?? null;
  });
}
