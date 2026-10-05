import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { urlDoBanco } from "./setup-global";

// Estes testes passam pelo src/lib/db.ts de verdade, contra o banco de teste.
// O que eles gravam fica (o login abre transações próprias); por isso cada um
// usa e-mail e endereço únicos.

let lib: typeof import("@/lib/autenticacao");
const sufixo = Date.now().toString(36);
const unico = (nome: string) => `${nome}-${sufixo}`;

beforeAll(async () => {
  process.env.DATABASE_URL = urlDoBanco();
  lib = await import("@/lib/autenticacao");
});
afterAll(async () => {
  await globalThis.__poolListaPronta?.end();
  globalThis.__poolListaPronta = undefined;
});

const cadastro = (k: string) => ({
  papelaria: "Papelaria " + k,
  slug: unico(k),
  nome: "Dona " + k,
  email: `${unico(k)}@exemplo.test`,
  senha: "senha-forte-123",
});

describe("senha", () => {
  it("cifra com sal e confere", async () => {
    const a = await lib.cifrarSenha("abc12345");
    const b = await lib.cifrarSenha("abc12345");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^scrypt\$/);
    expect(await lib.conferirSenha("abc12345", a)).toBe(true);
    expect(await lib.conferirSenha("abc12346", a)).toBe(false);
  });
});

describe("cadastro e login", () => {
  it("cadastra papelaria, dono e vínculo, e já abre a sessão", async () => {
    const d = cadastro("a");
    const r = await lib.cadastrar(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = await lib.usuarioDaSessao(r.token);
    expect(u?.email).toBe(d.email);
  });

  it("recusa e-mail repetido e endereço repetido ou reservado, nomeando o campo", async () => {
    const d = cadastro("b");
    expect((await lib.cadastrar(d)).ok).toBe(true);
    expect(await lib.cadastrar({ ...d, slug: unico("b2") })).toMatchObject({ ok: false, campo: "email" });
    expect(await lib.cadastrar({ ...d, email: `${unico("b3")}@exemplo.test` })).toMatchObject({ ok: false, campo: "slug" });
    expect(await lib.cadastrar({ ...cadastro("b4"), slug: "painel" })).toMatchObject({ ok: false, campo: "slug" });
    expect(await lib.cadastrar({ ...cadastro("b5"), senha: "curta" })).toMatchObject({ ok: false, campo: "senha" });
  });

  it("entra com a senha certa, em qualquer caixa de e-mail; recusa a errada sem dizer qual errou", async () => {
    const d = cadastro("c");
    await lib.cadastrar(d);
    const ok = await lib.entrar(d.email.toUpperCase(), d.senha, "1.1.1.1");
    expect(ok.ok).toBe(true);
    expect(await lib.entrar(d.email, "outra-senha", "1.1.1.1")).toEqual({ ok: false, motivo: "credenciais" });
    expect(await lib.entrar(`ninguem-${sufixo}@exemplo.test`, "x", "1.1.1.1")).toEqual({ ok: false, motivo: "credenciais" });
  });

  it("5 senhas erradas trancam o e-mail, mesmo com a senha certa depois", async () => {
    const d = cadastro("d");
    await lib.cadastrar(d);
    for (let i = 0; i < 5; i++) await lib.entrar(d.email, "errada", `2.2.2.${i}`);
    expect(await lib.entrar(d.email, d.senha, "3.3.3.3")).toEqual({ ok: false, motivo: "bloqueado" });
  });

  it("acertar limpa as falhas: errar 4, acertar, errar 4 de novo não tranca", async () => {
    const d = cadastro("e");
    await lib.cadastrar(d);
    for (let i = 0; i < 4; i++) await lib.entrar(d.email, "errada", "4.4.4.4");
    expect((await lib.entrar(d.email, d.senha, "4.4.4.4")).ok).toBe(true);
    for (let i = 0; i < 4; i++) await lib.entrar(d.email, "errada", "4.4.4.5");
    expect((await lib.entrar(d.email, d.senha, "4.4.4.5")).ok).toBe(true);
  });

  it("sair encerra a sessão; token inventado não vale", async () => {
    const d = cadastro("f");
    const r = await lib.cadastrar(d);
    if (!r.ok) throw new Error("cadastro falhou");
    expect(await lib.usuarioDaSessao(r.token)).not.toBeNull();
    await lib.sair(r.token);
    expect(await lib.usuarioDaSessao(r.token)).toBeNull();
    expect(await lib.usuarioDaSessao("inventado")).toBeNull();
    expect(await lib.usuarioDaSessao(undefined)).toBeNull();
  });

  it("o banco guarda o hash do token, nunca o token", async () => {
    const d = cadastro("g");
    const r = await lib.cadastrar(d);
    if (!r.ok) throw new Error("cadastro falhou");
    const pg = (await import("pg")).default;
    const c = new pg.Client({ connectionString: urlDoBanco() });
    await c.connect();
    const s = await c.query(`select s.id from app.sessao s join app.usuario u on u.id = s.usuario_id where u.email = $1`, [d.email]);
    const u = await c.query(`select senha_hash from app.usuario where email = $1`, [d.email]);
    await c.end();
    expect(s.rows[0].id).toMatch(/^[0-9a-f]{64}$/);
    expect(s.rows[0].id).not.toContain(r.token);
    expect(u.rows[0].senha_hash).not.toContain(d.senha);
  });
});
