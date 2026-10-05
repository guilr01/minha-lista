import { opcaoResolvida, type Faixa } from "./faixa";
import type { ItemDaLista, Opcao, ProdutoDoCatalogo } from "./vitrine";

// O carrinho do pai. Puro de propósito: roda na tela, e o teste de banco o
// confronta com o total que criar_pedido calcula.
//
// A linha guarda só a ESCOLHA. Nome, marca e preço são lidos dos dados que
// a página trouxe agora: se o catálogo mudar, recarregar atualiza o preço
// sem perder o que o pai montou.

export type Linha = {
  produto_id: string;
  faixa: Faixa;
  quantidade: number;
  removida: boolean;
};

export type Produto = {
  produto_id: string;
  nome: string;
  unidade: string;
  /** O que a escola pede. 0 para item que o pai adicionou. */
  quantidade_lista: number;
  observacao: string | null;
  opcoes: Opcao[];
};

export const QUANTIDADE_MAXIMA = 99;

export function produtosConhecidos(itens: ItemDaLista[], catalogo: ProdutoDoCatalogo[]): Map<string, Produto> {
  const m = new Map<string, Produto>();
  for (const c of catalogo) {
    m.set(c.produto_id, { produto_id: c.produto_id, nome: c.nome, unidade: c.unidade, quantidade_lista: 0, observacao: null, opcoes: c.opcoes });
  }
  // A lista vence o catálogo: traz a quantidade e a observação da escola.
  for (const i of itens) {
    m.set(i.produto_id, { produto_id: i.produto_id, nome: i.nome, unidade: i.unidade, quantidade_lista: i.quantidade, observacao: i.observacao, opcoes: i.opcoes });
  }
  return m;
}

export function linhasDaLista(itens: ItemDaLista[], faixa: Faixa): Linha[] {
  return itens.map((i) => ({ produto_id: i.produto_id, faixa, quantidade: i.quantidade, removida: false }));
}

/** Opção que vale para a linha, ou nula se o item está indisponível. */
export function opcaoDaLinha(l: Linha, produtos: Map<string, Produto>, faixa: Faixa = l.faixa): Opcao | null {
  const p = produtos.get(l.produto_id);
  return p ? opcaoResolvida(p.opcoes, faixa) : null;
}

/** Linhas que entram no pedido: não removidas e com opção disponível. */
export function linhasNoPedido(linhas: Linha[], produtos: Map<string, Produto>): Linha[] {
  return linhas.filter((l) => !l.removida && opcaoDaLinha(l, produtos) !== null);
}

export function subtotal(linhas: Linha[], produtos: Map<string, Produto>): number {
  return linhasNoPedido(linhas, produtos).reduce((t, l) => t + opcaoDaLinha(l, produtos)!.preco_centavos * l.quantidade, 0);
}

/** O total se a lista inteira fosse da faixa f (o passo "Escolha a faixa"). */
export function totalNaFaixa(linhas: Linha[], produtos: Map<string, Produto>, f: Faixa): number {
  return linhas.reduce((t, l) => {
    if (l.removida) return t;
    const o = opcaoDaLinha(l, produtos, f);
    return o ? t + o.preco_centavos * l.quantidade : t;
  }, 0);
}

/**
 * Faixa ESCOLHIDA em todas as linhas, ou "mista" quando o pai trocou alguma.
 * Item que caiu de faixa por não ter a escolhida não torna a lista mista: a
 * escolha foi uma só, e a substituição é avisada no próprio item.
 */
export function faixaDoCarrinho(linhas: Linha[], produtos: Map<string, Produto>): Faixa | "mista" | null {
  const faixas = new Set(linhasNoPedido(linhas, produtos).map((l) => l.faixa));
  if (faixas.size === 0) return null;
  return faixas.size === 1 ? [...faixas][0] : "mista";
}

/** O que vai para criar_pedido: a escolha, nunca o preço. */
export function itensParaPedido(linhas: Linha[], produtos: Map<string, Produto>) {
  return linhasNoPedido(linhas, produtos).map((l) => ({
    produto_id: l.produto_id,
    faixa: l.faixa,
    quantidade: l.quantidade,
  }));
}

/** Descarta o que o carrinho guardado tem e a página não conhece mais. */
export function linhasValidas(guardadas: unknown, produtos: Map<string, Produto>): Linha[] | null {
  if (!Array.isArray(guardadas)) return null;
  const vistos = new Set<string>();
  const out: Linha[] = [];
  for (const g of guardadas as Partial<Linha>[]) {
    if (!g || typeof g.produto_id !== "string" || !produtos.has(g.produto_id) || vistos.has(g.produto_id)) continue;
    if (g.faixa !== "economica" && g.faixa !== "intermediaria" && g.faixa !== "premium") continue;
    const q = Number(g.quantidade);
    if (!Number.isInteger(q) || q < 1 || q > QUANTIDADE_MAXIMA) continue;
    vistos.add(g.produto_id);
    out.push({ produto_id: g.produto_id, faixa: g.faixa, quantidade: q, removida: g.removida === true });
  }
  return out.length ? out : null;
}
