import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

// A cifra da senha, num lugar só: a aplicação (src/lib/autenticacao.ts) e o
// script de acesso (scripts/criar-acesso.mjs) importam daqui. Sem imports do
// projeto, de propósito, para o script rodar fora do Next.

const scrypt = promisify(scryptCb) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;

export const SENHA_MINIMA = 8;

export async function cifrarSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const h = await scrypt(senha.normalize("NFKC"), sal, 64);
  return `scrypt$${sal.toString("base64")}$${h.toString("base64")}`;
}

export async function conferirSenha(senha: string, guardada: string): Promise<boolean> {
  const [alg, sal, h] = guardada.split("$");
  if (alg !== "scrypt" || !sal || !h) return false;
  const esperado = Buffer.from(h, "base64");
  const obtido = await scrypt(senha.normalize("NFKC"), Buffer.from(sal, "base64"), esperado.length);
  return timingSafeEqual(obtido, esperado);
}
