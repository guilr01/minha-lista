// Tempo de cada tela com o banco de carga, UMA pessoa por vez: o custo de
// cada página antes de existir fila. Depois imprime as consultas mais caras
// que o próprio app executou (pg_stat_statements), sem copiar SQL do app para
// cá: cópia mede a cópia, e diverge do código no primeiro ajuste.
//
//   node scripts/carga/gerar-volume.mjs        (antes, uma vez)
//   DATABASE_URL=<lista_pronta_carga> pnpm build && pnpm start -p 3010
//   node scripts/carga/medir-telas.mjs
//
// Precisa de pg_stat_statements carregado no Postgres local
// (shared_preload_libraries); sem ele mede as telas e pula o ranking.
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const BASE = process.env.CARGA_URL ?? "http://localhost:3010";
const REPETICOES = Number(process.env.REPETICOES ?? 5);
const ADMIN = process.env.CARGA_ADMIN_URL ?? process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const url = new URL(ADMIN);
url.pathname = "/lista_pronta_carga";
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();

/** Ids reais de uma papelaria e uma sessão de painel para alguém dela. */
async function alvo(slug) {
  const { rows: [a] } = await db.query(`
    select f.id, f.slug, e.slug as escola, s.slug as serie, l.id as lista,
      (select id from public.produto p where p.fornecedor_id = f.id order by p.ordem limit 1) as produto,
      (select token from public.pedido p where p.fornecedor_id = f.id order by p.criado_em desc limit 1) as token,
      (select numero from public.pedido p where p.fornecedor_id = f.id and p.status = 'pago' order by p.criado_em desc limit 1) as numero,
      (select count(*) from public.pedido p where p.fornecedor_id = f.id) as pedidos
    from public.fornecedor f join public.escola e on e.fornecedor_id = f.id and e.slug = 'escola-1'
    join public.serie s on s.escola_id = e.id and s.slug = '1-ano'
    join public.lista l on l.serie_id = s.id and l.status = 'publicada'
    where f.slug = $1`, [slug]);
  const email = `carga@${slug}.test`;
  const { rows: [u] } = await db.query(
    `insert into app.usuario (email, nome) values ($1, 'Carga') on conflict (email) do update set nome = excluded.nome returning id`, [email]);
  await db.query(`insert into public.membro_fornecedor (fornecedor_id, user_id) values ($1, $2) on conflict do nothing`, [a.id, u.id]);
  const token = randomBytes(32).toString("hex");
  await db.query(`insert into app.sessao (id, usuario_id, expira_em) values ($1, $2, now() + interval '1 day')`,
    [createHash("sha256").update(token).digest("hex"), u.id]);
  return { ...a, cookie: `lp_sessao=${token}` };
}

function telas(a) {
  const c = `/${a.slug}/${a.escola}/${a.serie}`;
  return [
    ["cliente", `/${a.slug}`], ["cliente", `/${a.slug}/${a.escola}`], ["cliente", c],
    ["cliente", `${c}?etapa=2`], ["cliente", `${c}?etapa=3`], ["cliente", `/pedido/${a.token}`],
    ["painel", "/painel"], ["painel", `/painel/pedidos/${a.numero}`], ["painel", "/painel/catalogo"],
    ["painel", `/painel/catalogo/${a.produto}`], ["painel", "/painel/escolas"], ["painel", `/painel/listas/${a.lista}`],
    ["painel", `/painel/listas/${a.lista}/importar`], ["painel", "/painel/loja"],
  ];
}

async function abrir(caminho, cookie) {
  const t = performance.now();
  const r = await fetch(BASE + caminho, { headers: cookie ? { cookie } : {}, redirect: "manual" });
  const corpo = await r.arrayBuffer();
  return { ms: performance.now() - t, status: r.status, kb: corpo.byteLength / 1024 };
}

const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const temStats = (await db.query("select 1 from pg_extension where extname = 'pg_stat_statements'")).rowCount > 0;

for (const slug of ["gigante", "carga-2"]) {
  const a = await alvo(slug);
  console.log(`\n${slug}: ${a.pedidos} pedidos · tempo de ${REPETICOES} aberturas seguidas (mediana · pior) e tamanho da página`);
  if (temStats) await db.query("select pg_stat_statements_reset()");
  for (const [area, caminho] of telas(a)) {
    const cookie = area === "painel" ? a.cookie : null;
    await abrir(caminho, cookie); // aquece: compila a rota e enche o cache do banco
    const xs = [];
    let ultimo;
    for (let i = 0; i < REPETICOES; i++) { ultimo = await abrir(caminho, cookie); xs.push(ultimo.ms); }
    const aviso = ultimo.status === 200 ? "" : `  ← status ${ultimo.status}`;
    console.log(`  ${caminho.replace(a.token, "<token>").replace(a.lista, "<lista>").replace(a.produto, "<produto>").slice(0, 52).padEnd(52)}`
      + `${mediana(xs).toFixed(0).padStart(7)} ms ${Math.max(...xs).toFixed(0).padStart(7)} ms ${ultimo.kb.toFixed(0).padStart(6)} KB${aviso}`);
  }
  if (temStats) {
    const { rows } = await db.query(`
      select calls, round(mean_exec_time::numeric, 1) as media, round(total_exec_time::numeric) as total,
             regexp_replace(left(query, 110), '\\s+', ' ', 'g') as consulta
        from pg_stat_statements
       where dbid = (select oid from pg_database where datname = current_database())
         and query !~* '^(begin|commit|rollback|set |select set_config|select pg_stat)'
       order by total_exec_time desc limit 8`);
    console.log(`  consultas que mais custaram nesta rodada (chamadas · média · total):`);
    for (const r of rows) console.log(`    ${String(r.calls).padStart(5)} · ${String(r.media).padStart(8)} ms · ${String(r.total).padStart(7)} ms  ${r.consulta}`);
  }
}
await db.end();
