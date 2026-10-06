// O endereço do link da papelaria (/papelaria-central). Mesma regra do banco
// (fornecedor_slug_check); o banco continua sendo quem recusa.
export const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugValido(slug: string): boolean {
  return FORMATO_SLUG.test(slug) && slug.length >= 3 && slug.length <= 60;
}

/** "Papelaria São João" → "papelaria-sao-joao"; "3º ano" → "3-ano" */
export function sugerirSlug(nome: string): string {
  return nome
    // O indicador ordinal vira "o" na normalização ("3o-ano"); sai antes.
    .replace(/[ºª°]/g, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}
