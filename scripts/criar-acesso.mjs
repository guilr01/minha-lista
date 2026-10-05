// Dá acesso ao painel de uma papelaria que já existe (a do seed, por exemplo).
// O cadastro pela tela cria papelaria NOVA; este script liga uma pessoa a uma
// existente, ou troca a senha de quem já tem conta.
//
//   SENHA='...' node --experimental-strip-types scripts/criar-acesso.mjs \
//     --email dona@papelaria.com --papelaria papelaria-central [--nome "Maria"] [--sql]
//
// Com --sql, não conecta: imprime os comandos para aplicar pelo conector do
// Neon (as sessões na nuvem não alcançam o banco direto). A senha nunca sai
// do script: só o resultado da cifra, que é o mesmo de src/lib/senha.ts.
import pg from "pg";
import { cifrarSenha, SENHA_MINIMA } from "../src/lib/senha.ts";
import { urlDoBanco } from "./banco.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith("--") ? [...acc, [a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? true : arr[i + 1]]] : acc), []),
);
const email = String(args.email ?? "").trim().toLowerCase();
const slug = String(args.papelaria ?? "");
const senha = process.env.SENHA ?? "";
if (!email || !slug) throw new Error("uso: SENHA=... --email <email> --papelaria <slug> [--nome <nome>] [--sql]");
if (senha.length < SENHA_MINIMA) throw new Error(`SENHA precisa de pelo menos ${SENHA_MINIMA} caracteres`);

const hash = await cifrarSenha(senha);
const nome = typeof args.nome === "string" ? args.nome : null;
const lit = (v) => (v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const comandos = [
  `insert into app.usuario (email, nome, senha_hash) values (${lit(email)}, ${lit(nome)}, ${lit(hash)})
   on conflict (email) do update set senha_hash = excluded.senha_hash, nome = coalesce(excluded.nome, app.usuario.nome)`,
  `insert into public.membro_fornecedor (fornecedor_id, user_id)
   select f.id, u.id from public.fornecedor f, app.usuario u where f.slug = ${lit(slug)} and u.email = ${lit(email)}
   on conflict (fornecedor_id, user_id) do nothing`,
];

if (args.sql) {
  console.log(JSON.stringify(comandos));
} else {
  const c = new pg.Client({ connectionString: urlDoBanco() });
  await c.connect();
  try {
    await c.query("begin");
    for (const sql of comandos) await c.query(sql);
    const r = await c.query("select 1 from public.fornecedor where slug = $1", [slug]);
    if (!r.rowCount) throw new Error(`papelaria ${slug} não existe`);
    await c.query("commit");
    console.log(`Acesso de ${email} à papelaria ${slug} pronto.`);
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
