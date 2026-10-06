import { createHash } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { urlDoBanco } from "./setup-global";

// Como test/db/autenticacao.test.ts: passa pelo src/lib/db.ts de verdade e o
// que grava fica. Cada teste usa e-mail e origem únicos.

let lib: typeof import("@/lib/autenticacao");
let dono: pg.Client;
const sufixo = Date.now().toString(36);
const unico = (nome: string) => `${nome}-${sufixo}`;
const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

beforeAll(async () => {
  process.env.DATABASE_URL = urlDoBanco();
  lib = await import("@/lib/autenticacao");
  dono = new pg.Client({ connectionString: urlDoBanco() });
  await dono.connect();
});
afterAll(async () => {
  await dono.end();
  await globalThis.__poolListaPronta?.end();
  globalThis.__poolListaPronta = undefined;
});

async function conta(k: string) {
  const d = {
    papelaria: "Papelaria " + k,
    slug: unico("rec-" + k),
    nome: "Dona " + k,
    email: `${unico("rec-" + k)}@exemplo.test`,
    senha: "senha-antiga-123",
  };
  const r = await lib.cadastrar(d);
  if (!r.ok) throw new Error(r.mensagem);
  return { ...d, sessao: r.token };
}

describe("pedir a recuperação", () => {
  it("devolve o envio para quem tem conta e nada para quem não tem, com a mesma cara para a tela", async () => {
    const c = await conta("a");
    const envio = await lib.pedirRecuperacao(c.email.toUpperCase(), unico("o-a"));
    expect(envio).toMatchObject({ para: c.email, nome: c.nome });
    expect(envio!.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await lib.pedirRecuperacao(`${unico("ninguem")}@exemplo.test`, unico("o-a2"))).toBeNull();
    expect(await lib.pedirRecuperacao("isto não é e-mail", unico("o-a3"))).toBeNull();
  });

  it("o banco guarda o hash do token, nunca o token", async () => {
    const c = await conta("b");
    const envio = await lib.pedirRecuperacao(c.email, unico("o-b"));
    const r = await dono.query("select id from app.recuperacao_senha where id = $1 or id = $2", [envio!.token, sha256(envio!.token)]);
    expect(r.rows).toEqual([{ id: sha256(envio!.token) }]);
  });

  it("3 pedidos por e-mail por hora; o quarto não gera link", async () => {
    const c = await conta("c");
    for (let i = 0; i < 3; i++) expect(await lib.pedirRecuperacao(c.email, unico(`o-c${i}`))).not.toBeNull();
    expect(await lib.pedirRecuperacao(c.email, unico("o-c9"))).toBeNull();
  });

  it("10 pedidos por origem por hora, mesmo para e-mails diferentes", async () => {
    const origem = unico("o-d");
    for (let i = 0; i < 10; i++) await lib.pedirRecuperacao(`${unico("d" + i)}@exemplo.test`, origem);
    const c = await conta("d");
    expect(await lib.pedirRecuperacao(c.email, origem)).toBeNull();
    expect(await lib.pedirRecuperacao(c.email, unico("o-d2"))).not.toBeNull();
  });

  it("pedir de novo invalida o link anterior", async () => {
    const c = await conta("e");
    const primeiro = await lib.pedirRecuperacao(c.email, unico("o-e"));
    const segundo = await lib.pedirRecuperacao(c.email, unico("o-e2"));
    expect(await lib.recuperacaoValida(primeiro!.token)).toBe(false);
    expect(await lib.recuperacaoValida(segundo!.token)).toBe(true);
    expect(await lib.redefinirSenha(primeiro!.token, "senha-nova-456")).toMatchObject({ ok: false, motivo: "link" });
  });
});

describe("criar a senha nova", () => {
  it("troca a senha, abre sessão, encerra as outras e o link não serve de novo", async () => {
    const c = await conta("f");
    const envio = await lib.pedirRecuperacao(c.email, unico("o-f"));
    const r = await lib.redefinirSenha(envio!.token, "senha-nova-456");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await lib.usuarioDaSessao(r.token))?.email).toBe(c.email);
    expect(await lib.usuarioDaSessao(c.sessao)).toBeNull();
    expect(await lib.entrar(c.email, c.senha, unico("o-f2"))).toEqual({ ok: false, motivo: "credenciais" });
    expect((await lib.entrar(c.email, "senha-nova-456", unico("o-f3"))).ok).toBe(true);
    expect(await lib.redefinirSenha(envio!.token, "outra-senha-789")).toMatchObject({ ok: false, motivo: "link" });
  });

  it("link vencido não serve", async () => {
    const c = await conta("g");
    const envio = await lib.pedirRecuperacao(c.email, unico("o-g"));
    await dono.query("update app.recuperacao_senha set expira_em = now() - interval '1 second' where id = $1", [sha256(envio!.token)]);
    expect(await lib.recuperacaoValida(envio!.token)).toBe(false);
    expect(await lib.redefinirSenha(envio!.token, "senha-nova-456")).toMatchObject({ ok: false, motivo: "link" });
  });

  it("senha curta é recusada SEM gastar o link", async () => {
    const c = await conta("h");
    const envio = await lib.pedirRecuperacao(c.email, unico("o-h"));
    expect(await lib.redefinirSenha(envio!.token, "curta")).toMatchObject({ ok: false, motivo: "senha" });
    expect(await lib.recuperacaoValida(envio!.token)).toBe(true);
  });

  it("destranca quem errou a senha 5 vezes", async () => {
    const c = await conta("i");
    for (let i = 0; i < 5; i++) await lib.entrar(c.email, "errada", unico(`o-i${i}`));
    expect(await lib.entrar(c.email, c.senha, unico("o-i8"))).toEqual({ ok: false, motivo: "bloqueado" });
    const envio = await lib.pedirRecuperacao(c.email, unico("o-i9"));
    expect((await lib.redefinirSenha(envio!.token, "senha-nova-456")).ok).toBe(true);
    expect((await lib.entrar(c.email, "senha-nova-456", unico("o-i10"))).ok).toBe(true);
  });

  it("token inventado ou gigante não serve e não estoura", async () => {
    expect(await lib.recuperacaoValida("x".repeat(43))).toBe(false);
    expect(await lib.recuperacaoValida("x".repeat(5000))).toBe(false);
    expect(await lib.redefinirSenha("x".repeat(5000), "senha-nova-456")).toMatchObject({ ok: false, motivo: "link" });
  });
});
