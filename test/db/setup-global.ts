import pg from "pg";
import { migrar, semear } from "../../scripts/banco.mjs";

// Monta um banco descartável como o Neon: o DONO não é superusuário. Rodar os
// testes como superusuário esconde o defeito mais caro deste desenho, porque
// superusuário ignora o RLS: a vitrine passaria aqui e voltaria vazia lá.
export const BANCO_DE_TESTE = "lista_pronta_teste";
export const DONO = "lp_dono";

const admin = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

export function urlDoBanco(): string {
  const url = new URL(admin);
  url.username = DONO;
  url.password = DONO;
  url.pathname = "/" + BANCO_DE_TESTE;
  return url.toString();
}

export default async function setup() {
  const a = new pg.Client({ connectionString: admin });
  await a.connect();
  await a.query(`drop database if exists ${BANCO_DE_TESTE} with (force)`);
  // Papéis de um teste anterior: recriados pelo dono, como no Neon, onde é o
  // dono quem os cria. Num cluster que os use em outro banco, o drop falha
  // e a migração reaproveita os existentes.
  for (const papel of ["anon", "authenticated"]) {
    await a.query(`drop role if exists ${papel}`).catch(() => {});
  }
  const existe = await a.query("select 1 from pg_roles where rolname = $1", [DONO]);
  if (!existe.rowCount) {
    await a.query(`create role ${DONO} login password '${DONO}' nosuperuser createrole createdb`);
  }
  await a.query(`create database ${BANCO_DE_TESTE} owner ${DONO}`);
  await a.end();

  const db = new pg.Client({ connectionString: urlDoBanco() });
  await db.connect();
  await migrar(db);
  await semear(db);
  // Duas vezes de propósito: o seed precisa ser re-executável.
  await semear(db);
  // E migrar de novo não reaplica nada.
  if ((await migrar(db)).length) throw new Error("migrar reaplicou migrações");
  await db.end();
}
