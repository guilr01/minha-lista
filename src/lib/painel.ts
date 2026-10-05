import "server-only";
import { comoUsuario } from "./db";
import type { Faixa } from "./faixa";
import type { StatusPedido } from "./vitrine";

// As leituras do painel. Todas pelo papel `authenticated` com o usuário da
// sessão: a RLS devolve só o que é da papelaria dele. O filtro por
// fornecedor_id aqui escolhe ENTRE as papelarias da pessoa; não é ele que
// isola uma papelaria da outra.

/** Status que aparecem no painel: do pago em diante. */
export const STATUS_DO_PAINEL = ["pago", "em_separacao", "saiu_para_entrega", "pronto_para_retirada", "entregue"] as const;

export type ResumoDoPedido = {
  id: string;
  numero: number;
  status: StatusPedido;
  aluno_nome: string;
  responsavel_nome: string;
  escola_nome: string;
  serie_nome: string;
  modalidade: "entrega" | "retirada";
  total_centavos: number;
  pago_em: string | null;
  criado_em: string;
  itens: number;
  separados: number;
  faixas: Faixa[];
};

export async function listarPedidos(usuarioId: string, fornecedorId: string) {
  return comoUsuario(usuarioId, async (q) => {
    const r = await q<ResumoDoPedido>(
      `select p.id, p.numero, p.status, p.aluno_nome, p.responsavel_nome, p.escola_nome,
              p.serie_nome, p.modalidade, p.total_centavos, p.pago_em, p.criado_em,
              count(i.id)::int as itens,
              count(i.id) filter (where i.separado)::int as separados,
              -- ::text: o driver não converte array de enum, e devolveria a
              -- string "{premium}" no lugar de ["premium"].
              array_agg(distinct i.faixa_pedida::text) as faixas
         from public.pedido p
         join public.pedido_item i on i.pedido_id = p.id
        where p.fornecedor_id = $1 and p.status = any ($2::public.status_pedido[])
        group by p.id
        order by coalesce(p.pago_em, p.criado_em) desc`,
      [fornecedorId, STATUS_DO_PAINEL],
    );
    return r.rows;
  });
}

export type PedidoDoPainel = {
  id: string;
  numero: number;
  status: StatusPedido;
  aluno_nome: string;
  responsavel_nome: string;
  responsavel_whatsapp: string;
  escola_nome: string;
  serie_nome: string;
  ano_letivo: number;
  modalidade: "entrega" | "retirada";
  endereco: { cep: string; logradouro: string; numero: string; complemento: string | null; bairro: string | null; cidade: string | null } | null;
  metodo_pagamento: "pix" | "cartao";
  parcelas: number;
  subtotal_centavos: number;
  taxa_entrega_centavos: number;
  total_centavos: number;
  criado_em: string;
  pago_em: string | null;
  token: string;
  itens: {
    id: string;
    nome_produto: string;
    marca: string;
    faixa: Faixa;
    faixa_pedida: Faixa;
    quantidade: number;
    quantidade_lista: number;
    origem: "lista" | "adicionado";
    preco_unitario_centavos: number;
    separado: boolean;
  }[];
  eventos: { status_para: StatusPedido; criado_em: string; autor: string | null }[];
};

export async function buscarPedidoDoPainel(usuarioId: string, fornecedorId: string, numero: number) {
  return comoUsuario(usuarioId, async (q) => {
    const p = await q<Omit<PedidoDoPainel, "itens" | "eventos">>(
      `select id, numero, status, aluno_nome, responsavel_nome, responsavel_whatsapp, escola_nome,
              serie_nome, ano_letivo, modalidade, endereco, metodo_pagamento, parcelas,
              subtotal_centavos, taxa_entrega_centavos, total_centavos, criado_em, pago_em, token
         from public.pedido where fornecedor_id = $1 and numero = $2`,
      [fornecedorId, numero],
    );
    if (!p.rows[0]) return null;
    const itens = await q<PedidoDoPainel["itens"][number]>(
      `select id, nome_produto, marca, faixa, faixa_pedida, quantidade, quantidade_lista, origem,
              preco_unitario_centavos, separado
         from public.pedido_item where pedido_id = $1 order by ordem`,
      [p.rows[0].id],
    );
    // A trilha guarda o id de quem mudou o status; o nome vem de app.usuario,
    // que este papel não lê. Basta saber se foi alguém da equipe.
    const eventos = await q<PedidoDoPainel["eventos"][number]>(
      `select status_para, criado_em, case when autor_id is null then null else 'equipe' end as autor
         from public.pedido_evento where pedido_id = $1 order by criado_em, id`,
      [p.rows[0].id],
    );
    return { ...p.rows[0], itens: itens.rows, eventos: eventos.rows } as PedidoDoPainel;
  });
}
