// Teste de carga: clientes comprando ao mesmo tempo, em degraus de
// concorrência, contra o build de produção e o banco de carga.
//
//   node scripts/carga/carga-http.mjs                       (todas as papelarias)
//   ALVO=gigante node scripts/carga/carga-http.mjs          (todos na mesma papelaria)
//   DEGRAUS=5,10,20 SEGUNDOS=20 node scripts/carga/carga-http.mjs
//
// Cada cliente virtual faz o caminho inteiro, sem pausa entre os passos: abre a
// lista, a revisão, os dados, FINALIZA a compra pela mesma Server Action que o
// navegador chama (o id sai do manifesto do build) e abre a página do pedido.
// Sem pausa é de propósito: mede o teto, não um dia comum.
//
// Em cada degrau mede o tempo de CPU gasto pelo Postgres e pelo Node (lido de
// /proc), porque é ISSO que se converte em produção: o Neon cobra e limita por
// CPU (CU-hora), e a Vercel por CPU ativa. Vazão local depende da máquina; CPU
// por compra não.
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";

const BASES = (process.env.CARGA_URLS ?? "http://localhost:3010,http://localhost:3011").split(",");
const DEGRAUS = (process.env.DEGRAUS ?? "5,10,20,40,80,160").split(",").map(Number);
const SEGUNDOS = Number(process.env.SEGUNDOS ?? 30);
const ALVO = process.env.ALVO ?? null;
const ADMIN = process.env.CARGA_ADMIN_URL ?? process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";

const manifesto = JSON.parse(readFileSync(new URL("../../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
const ACAO = Object.entries(manifesto.node).find(([, v]) => v.exportedName === "fazerPedido")?.[0];
if (!ACAO) throw new Error("fazerPedido não está no manifesto: rode pnpm build antes");

const url = new URL(ADMIN);
url.pathname = "/lista_pronta_carga";
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
const { rows: listas } = await db.query(`
  select f.slug, e.slug as escola, s.slug as serie, l.id as lista_id,
         jsonb_agg(jsonb_build_object('produto_id', i.produto_id, 'quantidade', i.quantidade)) as itens
    from public.lista l join public.serie s on s.id = l.serie_id join public.escola e on e.id = s.escola_id
    join public.fornecedor f on f.id = l.fornecedor_id join public.lista_item i on i.lista_id = l.id
   where l.status = 'publicada' and i.alternativa_de is null and ($1::text is null or f.slug = $1)
     -- Como na tela: produto sem nenhuma faixa à venda não chega à compra.
     and exists (select 1 from public.produto_opcao o where o.produto_id = i.produto_id and o.disponivel)
     and f.slug <> 'papelaria-central'
   group by 1, 2, 3, 4`, [ALVO]);
await db.end();
console.log(`${listas.length} listas · ação ${ACAO.slice(0, 10)}… · ${BASES.length} instância(s) do app · ${ALVO ? `todos na papelaria ${ALVO}` : "papelarias sorteadas"}`);

/** CPU (s) somada dos processos cujo comando casa com o padrão, lida de /proc. */
function cpu(padrao) {
  let ticks = 0;
  for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      if (!padrao.test(cmd)) continue;
      const campos = readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ");
      ticks += Number(campos[11]) + Number(campos[12]); // utime + stime
    } catch { /* processo terminou no meio da leitura */ }
  }
  return ticks / 100;
}
const cpuBanco = () => cpu(/^postgres: /);
const cpuApp = () => cpu(/next-server|next start/);

const FAIXAS = ["economica", "intermediaria", "premium"];
let seq = 0;
async function cliente(medidas, fim) {
  while (Date.now() < fim) {
    const l = listas[Math.floor(Math.random() * listas.length)];
    const base = BASES[seq++ % BASES.length];
    const c = `/${l.slug}/${l.escola}/${l.serie}`;
    const passos = [
      ["lista", () => fetch(base + c)],
      ["revisão", () => fetch(base + c + "?etapa=2")],
      ["dados", () => fetch(base + c + "?etapa=3")],
      ["compra", () => fetch(base + c + "?etapa=3", {
        method: "POST",
        headers: { "Next-Action": ACAO, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component", Origin: base },
        body: JSON.stringify([{
          lista_id: l.lista_id, faixa_base: FAIXAS[seq % 3], metodo_pagamento: "pix", parcelas: 1, modalidade: "retirada",
          aluno_nome: "Aluno da Carga", responsavel_nome: "Responsável da Carga", responsavel_whatsapp: "11999990000",
          itens: l.itens.map((i) => ({ ...i, faixa: FAIXAS[seq % 3] })),
        }]),
      })],
    ];
    let token = null;
    for (const [nome, fazer] of passos) {
      const t = performance.now();
      let ok = false;
      try {
        const r = await fazer();
        const corpo = await r.text();
        ok = r.status === 200;
        if (nome === "compra") {
          token = corpo.match(/"token":"([0-9a-f]{64})"/)?.[1] ?? null;
          ok = ok && !!token;
        }
      } catch { /* conta como erro */ }
      (medidas[nome] ??= []).push(performance.now() - t);
      if (!ok) { medidas.erros = (medidas.erros ?? 0) + 1; break; }
    }
    if (token) {
      const t = performance.now();
      const r = await fetch(base + `/pedido/${token}`).catch(() => null);
      await r?.text();
      (medidas["pedido"] ??= []).push(performance.now() - t);
      medidas.compras = (medidas.compras ?? 0) + 1;
    }
  }
}

const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);
console.log("\nclientes  compras/s  páginas/s  erros   compra p50/p95/p99 (ms)   lista p95   CPU banco/compra  CPU app/compra  banco ocupado");
for (const n of DEGRAUS) {
  const medidas = {};
  const b0 = cpuBanco(), a0 = cpuApp(), t0 = Date.now();
  const fim = t0 + SEGUNDOS * 1000;
  await Promise.all(Array.from({ length: n }, () => cliente(medidas, fim)));
  const s = (Date.now() - t0) / 1000;
  const db = cpuBanco() - b0, app = cpuApp() - a0;
  const compras = medidas.compras ?? 0;
  const paginas = ["lista", "revisão", "dados", "pedido"].reduce((t, k) => t + (medidas[k]?.length ?? 0), 0);
  const c = medidas.compra ?? [];
  console.log(`${String(n).padStart(8)} ${(compras / s).toFixed(1).padStart(10)} ${(paginas / s).toFixed(1).padStart(10)} ${String(medidas.erros ?? 0).padStart(6)}`
    + `   ${pct(c, 0.5).toFixed(0).padStart(6)} / ${pct(c, 0.95).toFixed(0).padStart(5)} / ${pct(c, 0.99).toFixed(0).padStart(5)}`
    + `   ${pct(medidas.lista ?? [], 0.95).toFixed(0).padStart(8)}`
    + `   ${compras ? ((db / compras) * 1000).toFixed(0).padStart(9) + " ms" : "        -"}`
    + `   ${compras ? ((app / compras) * 1000).toFixed(0).padStart(9) + " ms" : "        -"}`
    + `   ${((db / s / 2) * 100).toFixed(0).padStart(6)}% de 2 núcleos`);
  if ((medidas.erros ?? 0) > compras * 0.05 && compras > 0) { console.log("mais de 5% de erros: parando a subida"); break; }
}
