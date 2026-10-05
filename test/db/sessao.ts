import pg from "pg";
import { urlDoBanco } from "./setup-global";

// Cada teste roda numa transação que SEMPRE é desfeita: nada que um teste
// escreve chega ao seguinte.

export const PAPELARIA_CENTRAL = "00000000-0000-4000-8000-000000000001";

let pool: pg.Pool | undefined;
export function conexao(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: process.env.LP_TEST_DB ?? urlDoBanco(), max: 2 });
  return pool;
}

export async function encerrar() {
  await pool?.end();
  pool = undefined;
}

export type Q = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<pg.QueryResult<T>>;

/** Executa como o dono do banco (o papel do sistema, sem RLS), e desfaz. */
export async function emSandbox<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const c = await conexao().connect();
  try {
    await c.query("begin");
    return await fn((sql, params) => c.query(sql, params));
  } finally {
    await c.query("rollback");
    c.release();
  }
}

/** Troca de papel dentro da transação, como src/lib/db.ts faz por requisição. */
export async function trocarPara(q: Q, papel: "anon" | "authenticated", userId?: string) {
  await q(`select set_config('app.usuario_id', $1, true)`, [userId ?? ""]);
  await q(`set local role ${papel}`);
}

/** Volta para o dono do banco dentro da mesma transação. */
export async function voltarAoDono(q: Q) {
  await q("reset role");
}

/** Espera que a consulta falhe, devolvendo a mensagem. Usa savepoint para
 *  a transação continuar utilizável depois do erro. */
export async function falha(q: Q, sql: string, params?: unknown[]): Promise<string> {
  await q("savepoint s");
  try {
    await q(sql, params);
  } catch (e) {
    await q("rollback to savepoint s");
    return (e as Error).message;
  }
  await q("release savepoint s");
  throw new Error(`esperava falha e passou: ${sql}`);
}

/** Cria um usuário e uma segunda papelaria com o mínimo para isolar. */
export async function outraPapelaria(q: Q) {
  const r = await q<{ user_a: string; user_b: string; forn_b: string }>(`
    with ua as (insert into app.usuario (email) values ('a@exemplo.test') returning id),
         ub as (insert into app.usuario (email) values ('b@exemplo.test') returning id),
         fb as (insert into public.fornecedor (nome, slug) values ('Papelaria Rival', 'papelaria-rival') returning id),
         ma as (insert into public.membro_fornecedor (fornecedor_id, user_id) select '${PAPELARIA_CENTRAL}', id from ua),
         mb as (insert into public.membro_fornecedor (fornecedor_id, user_id) select fb.id, ub.id from fb, ub)
    select ua.id as user_a, ub.id as user_b, fb.id as forn_b from ua, ub, fb`);
  const { user_a, user_b, forn_b } = r.rows[0];
  const prod = await q<{ id: string }>(
    `insert into public.produto (fornecedor_id, nome) values ($1, 'Caderno rival') returning id`,
    [forn_b],
  );
  await q(
    `insert into public.produto_opcao (fornecedor_id, produto_id, faixa, marca, preco_centavos)
     values ($1, $2, 'economica', 'Marca rival', 500)`,
    [forn_b, prod.rows[0].id],
  );
  return { userA: user_a, userB: user_b, fornB: forn_b, produtoB: prod.rows[0].id };
}
