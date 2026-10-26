import { linhasNoPedido, produtosDoItem, type Linha, type Produto } from "./carrinho";
import { ROTULO_FAIXA, type Faixa } from "./faixa";
import type { ItemDaLista } from "./vitrine";

// Os descontos que a papelaria liga na tela Loja. A MESMA regra existe no
// banco, em app.descontos_aplicados (migração 0008), que é quem cobra;
// test/db/carrinho-paridade.test.ts confronta as duas.
//
//   lista_completa  todos os itens da lista que estão à venda, cada um na
//                   quantidade da escola ou mais (trocar faixa e incluir pode)
//   pix             pagamento no Pix
//   valor_minimo    produtos somando a partir de minimo_centavos
//   faixa           todos os itens escolhidos na faixa da regra
//
// Os percentuais se somam, com teto de 50%, e valem só sobre os produtos.

export const REGRAS = ["lista_completa", "pix", "valor_minimo", "faixa"] as const;
export type Regra = (typeof REGRAS)[number];
export const TETO_DESCONTO = 50;

type Base = { ativo: boolean; percentual: number };
export type RegrasDeDesconto = {
  lista_completa?: Base;
  pix?: Base;
  valor_minimo?: Base & { minimo_centavos: number };
  faixa?: Base & { faixa: Faixa };
};

export const TITULO_REGRA: Record<Regra, string> = {
  lista_completa: "Lista completa",
  pix: "Pagamento no Pix",
  valor_minimo: "Valor mínimo",
  faixa: "Faixa da lista",
};

/** Como a regra aparece no resumo: "lista completa 5% + Pix 3%". */
export const ROTULO_CURTO: Record<Regra, string> = {
  lista_completa: "lista completa",
  pix: "Pix",
  valor_minimo: "valor mínimo",
  faixa: "faixa",
};

export function resumoDosDescontos(aplicadas: { regra: Regra; percentual: number }[]): string {
  return aplicadas.map((a) => `${ROTULO_CURTO[a.regra]} ${a.percentual}%`).join(" + ");
}

/** A frase que o pai lê: "5% levando a lista completa". */
export function fraseDaRegra(regra: Regra, regras: RegrasDeDesconto, reais: (c: number) => string): string {
  const r = regras[regra]!;
  switch (regra) {
    case "lista_completa": return `${r.percentual}% levando a lista completa`;
    case "pix": return `${r.percentual}% pagando no Pix`;
    case "valor_minimo": return `${r.percentual}% em compras a partir de ${reais(regras.valor_minimo!.minimo_centavos)}`;
    case "faixa": return `${r.percentual}% levando tudo na faixa ${ROTULO_FAIXA[regras.faixa!.faixa]}`;
  }
}

export function regrasAtivas(regras: RegrasDeDesconto | null | undefined): Regra[] {
  return REGRAS.filter((k) => regras?.[k]?.ativo);
}

/**
 * A lista está completa? Itens fora de venda não contam (o cliente não tem
 * como levá-los). Item com alternativas é um item só: qualquer produto do
 * grupo, na quantidade da escola, o completa (app.descontos_aplicados, 0009).
 */
export function listaCompleta(itens: ItemDaLista[], linhas: Linha[], produtos: Map<string, Produto>): boolean {
  const noPedido = linhasNoPedido(linhas, produtos);
  return itens
    .filter((i) => [i, ...(i.alternativas ?? [])].some((a) => a.opcoes.length > 0))
    .every((i) => {
      const grupo = produtosDoItem(i);
      return noPedido.some((l) => grupo.includes(l.produto_id) && l.quantidade >= i.quantidade);
    });
}

export type Desconto = {
  aplicadas: { regra: Regra; percentual: number }[];
  percentual: number;
  centavos: number;
};

export function descontoDoPedido(p: {
  regras: RegrasDeDesconto | null | undefined;
  itens: ItemDaLista[];
  linhas: Linha[];
  produtos: Map<string, Produto>;
  metodo: "pix" | "cartao";
  subtotal: number;
}): Desconto {
  const r = p.regras ?? {};
  const noPedido = linhasNoPedido(p.linhas, p.produtos);
  const cumpre: Record<Regra, boolean> = {
    lista_completa: listaCompleta(p.itens, p.linhas, p.produtos),
    pix: p.metodo === "pix",
    valor_minimo: p.subtotal >= (r.valor_minimo?.minimo_centavos ?? Infinity),
    faixa: noPedido.length > 0 && noPedido.every((l) => l.faixa === r.faixa?.faixa),
  };
  const aplicadas = REGRAS.filter((k) => r[k]?.ativo && cumpre[k]).map((k) => ({ regra: k, percentual: r[k]!.percentual }));
  const percentual = Math.min(TETO_DESCONTO, aplicadas.reduce((t, a) => t + a.percentual, 0));
  return { aplicadas, percentual, centavos: Math.floor((p.subtotal * percentual) / 100) };
}
