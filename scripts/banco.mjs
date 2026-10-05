// Aplicar migrações e semear, num lugar só. Usado pela linha de comando
// (scripts/migrar.mjs, scripts/semear.mjs) E pelos testes: o banco dos testes
// é montado pelo mesmo código que monta o de produção.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
export const PASTA_MIGRACOES = join(RAIZ, "db/migrations");
export const ARQUIVO_SEED = join(RAIZ, "db/seed.sql");

/** Aplica, em ordem e cada uma na sua transação, as migrações que faltam. */
export async function migrar(client, { log = () => {} } = {}) {
  await client.query(`
    create schema if not exists controle;
    create table if not exists controle.migracao (
      nome text primary key,
      aplicada_em timestamptz not null default now()
    );`);
  const feitas = new Set(
    (await client.query("select nome from controle.migracao")).rows.map((r) => r.nome),
  );
  const arquivos = readdirSync(PASTA_MIGRACOES).filter((a) => a.endsWith(".sql")).sort();
  const aplicadas = [];
  for (const nome of arquivos) {
    if (feitas.has(nome)) continue;
    await client.query("begin");
    try {
      await client.query(readFileSync(join(PASTA_MIGRACOES, nome), "utf8"));
      await client.query("insert into controle.migracao (nome) values ($1)", [nome]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback");
      throw new Error(`migração ${nome} falhou: ${e.message}`);
    }
    aplicadas.push(nome);
    log(`aplicada: ${nome}`);
  }
  return aplicadas;
}

/** O seed é idempotente: pode rodar quantas vezes for preciso. */
export async function semear(client) {
  await client.query("begin");
  try {
    await client.query(readFileSync(ARQUIVO_SEED, "utf8"));
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}

/** DATABASE_URL do ambiente ou do .env.local da raiz. */
export function urlDoBanco() {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(join(RAIZ, ".env.local"));
    } catch {
      // sem arquivo: segue para o erro abaixo
    }
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não definida (ambiente ou .env.local)");
  }
  return process.env.DATABASE_URL;
}
