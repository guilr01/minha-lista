// Dinheiro é inteiro em centavos em todo o sistema; só vira texto na tela.

const formato = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 123456 → "R$ 1.234,56" (com espaço comum, não o inseparável do Intl). */
export function reais(centavos: number): string {
  return formato.format(centavos / 100).replace(/ /g, " ");
}
