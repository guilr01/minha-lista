import "server-only";
import pg from "pg";

// O ÚNICO lugar que fala com o banco. A aplicação conecta como o dono (o papel
// do sistema, sem RLS) e, a cada operação, abre uma transação e veste o papel
// de quem pediu. Quem filtra é o RLS do Postgres; esta camada só diz QUEM é.
//
//   comoPai      → papel `anon`: só executa as funções da área pública
//   comoUsuario  → papel `authenticated` + app.usuario_id: o painel
//   comoSistema  → o dono, sem RLS: webhook de pagamento e nada mais
//
// test/db/acesso.test.ts falha se outro arquivo de src criar conexão.

declare global {
  var __poolListaPronta: pg.Pool | undefined;
}

function pool(): pg.Pool {
  if (!globalThis.__poolListaPronta) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    const p = new pg.Pool({ connectionString: url, max: 5 });
    // Sem ouvinte, um erro de conexão ociosa derruba o processo.
    p.on("error", (e) => console.error("[db] conexão ociosa falhou:", e.message));
    globalThis.__poolListaPronta = p;
  }
  return globalThis.__poolListaPronta;
}

export type Consulta = <T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
) => Promise<pg.QueryResult<T>>;

async function emTransacao<T>(
  papel: "anon" | "authenticated" | null,
  usuarioId: string | null,
  fn: (q: Consulta) => Promise<T>,
): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("begin");
    // Configuração e papel valem só nesta transação: o pooler do Neon
    // devolve a conexão para outra requisição logo depois.
    await c.query("select set_config('app.usuario_id', $1, true)", [usuarioId ?? ""]);
    if (papel) await c.query(`set local role ${papel}`);
    const r = await fn((sql, params) => c.query(sql, params));
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export function comoPai<T>(fn: (q: Consulta) => Promise<T>) {
  return emTransacao("anon", null, fn);
}

export function comoUsuario<T>(usuarioId: string, fn: (q: Consulta) => Promise<T>) {
  return emTransacao("authenticated", usuarioId, fn);
}

/** Sem RLS. Só para o que nenhum usuário faz: confirmar pagamento. */
export function comoSistema<T>(fn: (q: Consulta) => Promise<T>) {
  return emTransacao(null, null, fn);
}
