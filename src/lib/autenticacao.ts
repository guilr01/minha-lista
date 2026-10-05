import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { comoSistema } from "./db";
import { SENHA_MINIMA, cifrarSenha, conferirSenha } from "./senha";
import { slugValido } from "./slug";

export { SENHA_MINIMA, cifrarSenha, conferirSenha };

// Login próprio da papelaria (decisão de 05/10/2026). Três regras:
//   * a senha vira scrypt com sal (src/lib/senha.ts); o banco só vê o resultado;
//   * a sessão é um token aleatório de 32 bytes no cookie; o banco guarda o
//     SHA-256 dele, então ler a tabela de sessões não dá sessão a ninguém;
//   * errar a senha conta: 5 erros por e-mail ou 20 por origem em 15 minutos
//     trancam por 15 minutos. O limite e a janela são constantes daqui, não
//     parâmetros que alguém possa passar.

export const DURACAO_SESSAO_DIAS = 30;
const JANELA_MINUTOS = 15;
const FALHAS_POR_EMAIL = 5;
const FALHAS_POR_ORIGEM = 20;

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Cifra fixa para quando o e-mail não existe: a resposta leva o mesmo tempo
// e não denuncia quais e-mails têm conta.
let cifraFalsa: Promise<string> | undefined;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export type Usuario = { id: string; email: string; nome: string | null };

async function abrirSessao(usuarioId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await comoSistema((q) =>
    q(
      `insert into app.sessao (id, usuario_id, expira_em)
       values ($1, $2, now() + make_interval(days => $3))`,
      [sha256(token), usuarioId, DURACAO_SESSAO_DIAS],
    ),
  );
  return token;
}

export type ResultadoDeEntrada =
  | { ok: true; token: string; usuario: Usuario }
  | { ok: false; motivo: "credenciais" | "bloqueado" };

export async function entrar(emailDigitado: string, senha: string, origem: string | null): Promise<ResultadoDeEntrada> {
  const email = normalizarEmail(emailDigitado);
  const origemHash = origem ? sha256(origem) : null;

  const situacao = await comoSistema(async (q) => {
    const falhas = await q<{ por_email: number; por_origem: number }>(
      `select
         (select count(*)::int from app.falha_login
           where email = $1 and em > now() - make_interval(mins => $3)) as por_email,
         (select count(*)::int from app.falha_login
           where $2::text is not null and origem = $2 and em > now() - make_interval(mins => $3)) as por_origem`,
      [email, origemHash, JANELA_MINUTOS],
    );
    const u = await q<Usuario & { senha_hash: string | null }>(
      "select id, email, nome, senha_hash from app.usuario where email = $1",
      [email],
    );
    return { falhas: falhas.rows[0], usuario: u.rows[0] ?? null };
  });

  if (situacao.falhas.por_email >= FALHAS_POR_EMAIL || situacao.falhas.por_origem >= FALHAS_POR_ORIGEM) {
    return { ok: false, motivo: "bloqueado" };
  }

  const u = situacao.usuario;
  let certo = false;
  if (u?.senha_hash) {
    certo = await conferirSenha(senha, u.senha_hash);
  } else {
    await conferirSenha(senha, await (cifraFalsa ??= cifrarSenha("senha-que-ninguem-tem")));
  }

  if (!u || !certo) {
    await comoSistema((q) => q("insert into app.falha_login (email, origem) values ($1, $2)", [email, origemHash]));
    return { ok: false, motivo: "credenciais" };
  }

  // Acertar limpa as falhas deste e-mail: quem erra uma vez por semana não
  // se tranca sozinho com o tempo.
  await comoSistema((q) => q("delete from app.falha_login where email = $1", [email]));
  return { ok: true, token: await abrirSessao(u.id), usuario: { id: u.id, email: u.email, nome: u.nome } };
}

export async function usuarioDaSessao(token: string | undefined): Promise<Usuario | null> {
  if (!token || token.length > 100) return null;
  return comoSistema(async (q) => {
    const r = await q<Usuario>(
      `select u.id, u.email, u.nome from app.sessao s
         join app.usuario u on u.id = s.usuario_id
        where s.id = $1 and s.expira_em > now()`,
      [sha256(token)],
    );
    return r.rows[0] ?? null;
  });
}

export async function sair(token: string | undefined) {
  if (!token) return;
  await comoSistema((q) => q("delete from app.sessao where id = $1", [sha256(token)]));
}

export type DadosDeCadastro = {
  papelaria: string;
  slug: string;
  nome: string;
  email: string;
  senha: string;
};

export type ResultadoDeCadastro =
  | { ok: true; token: string }
  | { ok: false; campo: keyof DadosDeCadastro | null; mensagem: string };

/**
 * Cria a pessoa, a papelaria e o vínculo entre as duas, numa transação só:
 * papelaria sem dono, ou dono sem papelaria, não chegam a existir.
 */
export async function cadastrar(d: DadosDeCadastro): Promise<ResultadoDeCadastro> {
  const email = normalizarEmail(d.email);
  if (d.papelaria.trim().length < 2) return { ok: false, campo: "papelaria", mensagem: "Informe o nome da papelaria" };
  if (!slugValido(d.slug)) {
    return { ok: false, campo: "slug", mensagem: "Use de 3 a 60 letras minúsculas, números e hífens" };
  }
  if (d.nome.trim().length < 2) return { ok: false, campo: "nome", mensagem: "Informe seu nome" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, campo: "email", mensagem: "E-mail inválido" };
  if (d.senha.length < SENHA_MINIMA) {
    return { ok: false, campo: "senha", mensagem: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres` };
  }
  const hash = await cifrarSenha(d.senha);
  let usuarioId: string;
  try {
    usuarioId = await comoSistema(async (q) => {
      const u = await q<{ id: string }>(
        "insert into app.usuario (email, nome, senha_hash) values ($1, $2, $3) returning id",
        [email, d.nome.trim(), hash],
      );
      const f = await q<{ id: string }>(
        "insert into public.fornecedor (nome, slug) values ($1, $2) returning id",
        [d.papelaria.trim(), d.slug],
      );
      await q("insert into public.membro_fornecedor (fornecedor_id, user_id) values ($1, $2)", [f.rows[0].id, u.rows[0].id]);
      return u.rows[0].id;
    });
  } catch (e) {
    const restricao = (e as { constraint?: string }).constraint ?? "";
    const msg = (e as Error).message;
    if (restricao === "usuario_email_key") return { ok: false, campo: "email", mensagem: "Este e-mail já tem conta. Entre com ele." };
    if (restricao === "fornecedor_slug_key") return { ok: false, campo: "slug", mensagem: "Este endereço já está em uso. Escolha outro." };
    if (/fornecedor_slug_check/.test(restricao + msg)) {
      return { ok: false, campo: "slug", mensagem: "Este endereço é reservado pelo sistema. Escolha outro." };
    }
    throw e;
  }
  return { ok: true, token: await abrirSessao(usuarioId) };
}
