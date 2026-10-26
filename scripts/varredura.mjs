// pnpm varredura : abre cada tela redimensionando a janela de 640 a 1920 px
// (de 32 em 32, e 2560) e acusa o que compromete a leitura:
//
//   espremido  texto em três linhas ou mais com menos de 16 letras por linha
//              ("Bloco / de / desenho"): coluna que ficou com a sobra
//   cortado    conteúdo maior que a caixa que o esconde (tabela sem o botão)
//   linha>85   parágrafo com mais de 85 caracteres por linha
//   rola       a página inteira rola para o lado
//
// Com ESTRESSE=1, antes de medir ela alonga nomes e marcas curtos na própria
// página: o catálogo de exemplo tem nomes curtos, e o de uma papelaria de
// verdade tem "Bloco de desenho A4 branco 180 g/m² com 20 folhas". Arranjo que
// só passa com nome curto é o que quebra no catálogo seguinte.
//
// Precisa do `pnpm dev` no ar (VARREDURA_URL, padrão http://localhost:3000) e,
// para o painel, de um acesso: VARREDURA_EMAIL e VARREDURA_SENHA (ver
// scripts/criar-acesso.mjs). Os ids de lista, pedido e produto vêm do banco
// de DATABASE_URL. Sai com código 1 se achar problema.

import pg from "pg";
import { chromium } from "playwright";
import { urlDoBanco } from "./banco.mjs";

const B = process.env.VARREDURA_URL ?? "http://localhost:3000";
const PASSO = Number(process.env.PASSO ?? 32);
const LARGURAS = [];
for (let w = 640; w <= 1920; w += PASSO) LARGURAS.push(w);
LARGURAS.push(2560);
const ESTRESSE = process.env.ESTRESSE === "1";
const EMAIL = process.env.VARREDURA_EMAIL;
const SENHA = process.env.VARREDURA_SENHA;

const db = new pg.Client({ connectionString: urlDoBanco() });
await db.connect();
const { rows: [ids] } = await db.query(`
  select f.slug as papelaria, e.slug as escola, s.slug as serie, l.id as lista,
    (select id from public.produto p where p.fornecedor_id = f.id order by p.ordem limit 1) as produto,
    (select numero from public.pedido p where p.fornecedor_id = f.id order by p.criado_em desc limit 1) as numero,
    (select token from public.pedido p where p.fornecedor_id = f.id order by p.criado_em desc limit 1) as token
  from public.lista l join public.serie s on s.id = l.serie_id join public.escola e on e.id = s.escola_id
  join public.fornecedor f on f.id = l.fornecedor_id
  where exists (select 1 from public.lista_item i where i.lista_id = l.id)
  order by (select count(*) from public.lista_item i where i.lista_id = l.id) desc limit 1`);
await db.end();
if (!ids) throw new Error("Nenhuma lista com itens no banco: rode o seed (pnpm db:semear).");

const cliente = `/${ids.papelaria}/${ids.escola}/${ids.serie}`;
const ANONIMAS = ["/", "/entrar", "/entrar/esqueci", `/${ids.papelaria}`, `/${ids.papelaria}/${ids.escola}`,
  cliente, `${cliente}?etapa=2`, `${cliente}?etapa=3`, `/${ids.papelaria}/pedidos`, ...(ids.token ? [`/pedido/${ids.token}`] : [])];
const PAINEL = ["/painel", ...(ids.numero ? [`/painel/pedidos/${ids.numero}`] : []), "/painel/catalogo", "/painel/catalogo/novo",
  `/painel/catalogo/${ids.produto}`, "/painel/catalogo/importar", "/painel/escolas", `/painel/listas/${ids.lista}`,
  `/painel/listas/${ids.lista}/importar`, `/painel/listas/${ids.lista}/importar#conferencia`, "/painel/loja", "/painel/divulgar"];
const SO = process.env.SO ? process.env.SO.split(",") : null;
const LISTA_DA_ESCOLA = "02 cadernos brochura 96 folhas\n1 caixa de lápis de cor 24 cores (com nome)\n3 colas bastão\n" +
  "1 lápis ou lapiseira\n1 apontador com depósito PARA LÁPIS JUMBO\n" +
  "Livro: Extraordinário\n1 dicionário ilustrado\nTodo material deverá ser identificado com o nome do aluno.";

/**
 * Alonga nomes, marcas e escolas até o tamanho de um nome longo de verdade
 * (~32 caracteres, "Maria Eduarda Albuquerque Santos"). Não toca em
 * etiqueta, botão, título nem texto que não quebra linha por desenho: esses
 * têm vocabulário fixo, e alongá-los acusaria defeito que não existe.
 */
function estressar() {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const alvos = [];
  while (w.nextNode()) {
    const n = w.currentNode; const t = n.textContent.trim(); const el = n.parentElement;
    if (!el || el.closest("button, select, option, h1, h2, h3, th, nav, header, label, summary, code, svg, .rounded-full")) continue;
    if (getComputedStyle(el).whiteSpace === "nowrap" || el.closest("td")?.matches(".whitespace-nowrap")) continue;
    if (t.length < 4 || t.length > 28 || !/^\p{L}/u.test(t) || /R\$|\d{1,2}\/\d/.test(t)) continue;
    alvos.push(n);
  }
  for (const n of alvos) {
    let t = n.textContent;
    for (const palavra of ["Albuquerque", "Universitário", "Santos"]) if (t.trim().length + palavra.length + 1 <= 32) t += ` ${palavra}`;
    n.textContent = t;
  }
}

function sonda() {
  const visivel = (e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0; };
  const res = { maxChars: 0, maxTxt: "", espremidos: [], cortados: [], rola: document.documentElement.scrollWidth > innerWidth + 1 };
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode; const t = n.textContent.replace(/\s+/g, " ").trim(); const el = n.parentElement;
    if (!t || !el || !visivel(el) || el.closest("svg, script, style, .sr-only, nextjs-portal")) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const linhas = new Set([...r.getClientRects()].filter((x) => x.width > 1).map((x) => Math.round(x.top))).size || 1;
    const porLinha = t.length / linhas;
    if (t.length >= 60 && porLinha > res.maxChars) { res.maxChars = Math.round(porLinha); res.maxTxt = t.slice(0, 50); }
    if (linhas >= 3 && porLinha < 16 && t.length >= 12 && !/^https?:/.test(t)) res.espremidos.push(t.slice(0, 40));
  }
  for (const el of document.querySelectorAll("body *")) {
    if (!visivel(el) || el.closest("svg, .sr-only, nextjs-portal")) continue;
    const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && ["hidden", "clip"].includes(s.overflowX) && s.textOverflow !== "ellipsis" && el.textContent.trim())
      res.cortados.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`);
  }
  return res;
}

const b = await chromium.launch();
const contextos = [[await b.newContext(), ANONIMAS]];
if (EMAIL && SENHA) {
  const sessao = await b.newContext();
  const login = await sessao.newPage();
  await login.goto(B + "/entrar", { waitUntil: "networkidle" });
  await login.fill('input[name="email"]', EMAIL);
  await login.fill('input[name="senha"]', SENHA);
  await login.click('button[type="submit"]');
  await login.waitForURL(/painel/);
  contextos.push([sessao, PAINEL]);
} else {
  console.log("(sem VARREDURA_EMAIL e VARREDURA_SENHA: o painel fica de fora)\n");
}

let problemas = 0;
for (const [ctx, urls] of contextos) {
  for (const url of urls) {
    if (SO && !SO.some((s) => url.includes(s))) continue;
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(B + url.replace("#conferencia", ""), { waitUntil: "networkidle" });
    if (url.endsWith("#conferencia")) {
      await p.fill('textarea[name="texto"]', LISTA_DA_ESCOLA);
      await p.click('button:has-text("Comparar com o catálogo")');
      await p.waitForSelector("text=Fora da lista");
      await p.click("details summary");
    }
    if (ESTRESSE) await p.evaluate(estressar);
    const ruins = [];
    for (const largura of LARGURAS) {
      await p.setViewportSize({ width: largura, height: 900 });
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const r = await p.evaluate(sonda);
      if (r.espremidos.length || r.cortados.length || r.rola || r.maxChars > 85) ruins.push({ largura, ...r });
    }
    await p.close();
    const faixa = (xs) => `${xs[0].largura}–${xs[xs.length - 1].largura}`;
    const esp = ruins.filter((x) => x.espremidos.length), cor = ruins.filter((x) => x.cortados.length);
    const lon = ruins.filter((x) => x.maxChars > 85), rol = ruins.filter((x) => x.rola);
    problemas += ruins.length;
    console.log(`${url.slice(0, 56).padEnd(56)} ${ruins.length ? "" : "ok"}` +
      (esp.length ? ` espremido ${faixa(esp)} ex: ${JSON.stringify(esp[0].espremidos.slice(0, 2))}` : "") +
      (cor.length ? ` cortado ${faixa(cor)} ex: ${cor[0].cortados[0]}` : "") +
      (lon.length ? ` linha>85 ${faixa(lon)} (${lon[0].maxChars}c ${JSON.stringify(lon[0].maxTxt)})` : "") +
      (rol.length ? ` rola ${faixa(rol)}` : ""));
  }
}
await b.close();
console.log(problemas ? `\n${problemas} largura(s) com problema.` : "\nNenhum problema de leitura em nenhuma largura.");
process.exit(problemas ? 1 : 0);
