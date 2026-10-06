// Dinheiro é inteiro em centavos em todo o sistema; só vira texto na tela.

const formato = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 123456 → "R$ 1.234,56" (com espaço comum, não o inseparável do Intl). */
export function reais(centavos: number): string {
  return formato.format(centavos / 100).replace(/ /g, " ");
}

/**
 * O que a pessoa digita num campo de preço, em centavos. Aceita "12,90",
 * "12.90", "R$ 1.234,50" e "12". Nulo quando não é um valor positivo.
 */
export function centavosDe(texto: string): number | null {
  let s = texto.replace(/[^\d,.]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const c = Math.round(Number(s) * 100);
  return c > 0 ? c : null;
}

/** 1290 → "12,90", para preencher um campo de preço. */
export function paraCampo(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
