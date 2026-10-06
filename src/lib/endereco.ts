// O endereço público do site, para links que saem por e-mail.
//
// Em produção ele NÃO vem do cabeçalho Host: quem pede a recuperação escolhe
// o cabeçalho, e um Host forjado faria o e-mail da vítima levar o token para
// o domínio de quem atacou. Na Vercel vem do domínio de produção do projeto,
// que a própria Vercel injeta; URL_PUBLICA vence os dois quando houver
// domínio próprio.

type Ambiente = Partial<Record<"URL_PUBLICA" | "VERCEL_ENV" | "VERCEL_PROJECT_PRODUCTION_URL" | "VERCEL_URL" | "NODE_ENV", string>>;

export function enderecoPublico(host: string | null, ambiente: Ambiente = process.env): string {
  if (ambiente.URL_PUBLICA) return ambiente.URL_PUBLICA.replace(/\/+$/, "");
  if (ambiente.VERCEL_ENV === "production" && ambiente.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${ambiente.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (ambiente.VERCEL_URL) return `https://${ambiente.VERCEL_URL}`;
  if (ambiente.NODE_ENV === "production") throw new Error("defina URL_PUBLICA: sem ela não há endereço confiável para o link");
  return `http://${host && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? host : "localhost:3000"}`;
}
