import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

// Cria um banco descartável e aplica nele exatamente o que vai para o
// Supabase: as migrações, em ordem, e o seed. A única peça a mais é
// supabase-local.sql, que simula o que o Supabase já traz pronto.
export const BANCO_DE_TESTE = "lista_pronta_teste";

const base = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

export function urlDoBanco(): string {
  const url = new URL(base);
  url.pathname = "/" + BANCO_DE_TESTE;
  return url.toString();
}

export default async function setup() {
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`drop database if exists ${BANCO_DE_TESTE} with (force)`);
  await admin.query(`create database ${BANCO_DE_TESTE}`);
  await admin.end();

  const db = new pg.Client({ connectionString: urlDoBanco() });
  await db.connect();
  const raiz = process.cwd();
  await db.query(readFileSync(join(raiz, "test/db/supabase-local.sql"), "utf8"));
  const pasta = join(raiz, "supabase/migrations");
  for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith(".sql")).sort()) {
    try {
      await db.query(readFileSync(join(pasta, arquivo), "utf8"));
    } catch (e) {
      throw new Error(`migração ${arquivo} falhou: ${(e as Error).message}`);
    }
  }
  const seed = readFileSync(join(raiz, "supabase/seed.sql"), "utf8");
  await db.query(seed);
  // Duas vezes de propósito: o seed precisa ser re-executável.
  await db.query(seed);
  await db.end();

  process.env.LP_TEST_DB = urlDoBanco();
}
