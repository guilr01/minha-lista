// Divide SQL em comandos, respeitando comentários, strings, identificadores
// entre aspas e blocos $tag$...$tag$. Ver gerar-comandos.mjs.
import { readFileSync } from "node:fs";
export function dividir(sql) {
  const out = []; let atual = ""; let i = 0;
  while (i < sql.length) {
    const c = sql[i], d = sql.slice(i, i + 2);
    if (d === "--") { const f = sql.indexOf("\n", i); const fim = f < 0 ? sql.length : f; atual += sql.slice(i, fim); i = fim; continue; }
    if (d === "/*") { const f = sql.indexOf("*/", i + 2) + 2; atual += sql.slice(i, f); i = f; continue; }
    if (c === "'" || c === '"') { let j = i + 1; while (j < sql.length) { if (sql[j] === c) { if (sql[j + 1] === c) { j += 2; continue; } break; } j++; } atual += sql.slice(i, j + 1); i = j + 1; continue; }
    if (c === "$") { const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i)); if (m) { const tag = m[0]; const f = sql.indexOf(tag, i + tag.length); if (f < 0) throw new Error("dollar quote sem fim"); atual += sql.slice(i, f + tag.length); i = f + tag.length; continue; } }
    if (c === ";") { if (atual.trim()) out.push(atual.trim()); atual = ""; i++; continue; }
    atual += c; i++;
  }
  if (atual.replace(/--[^\n]*/g, "").trim()) out.push(atual.trim());
  // Remove comandos que só têm comentário
  return out.filter((s) => s.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim());
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const s = dividir(readFileSync(process.argv[2], "utf8"));
  console.log(JSON.stringify(s));
}
