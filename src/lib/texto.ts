/** Para busca: minúsculas e sem acento ("Lápis" e "lapis" se encontram). */
export function paraBusca(texto: string): string {
  return texto.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();
}
