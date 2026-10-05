import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { DURACAO_SESSAO_DIAS, usuarioDaSessao, type Usuario } from "./autenticacao";
import { comoUsuario } from "./db";

// A sessão do painel, vista pelas páginas e ações. TODA ação do painel chama
// exigirUsuario(): o layout barrar a página não protege a Server Action, que
// é um endpoint público.

export const COOKIE_SESSAO = "lp_sessao";

export const usuarioAtual = cache(async (): Promise<Usuario | null> =>
  usuarioDaSessao((await cookies()).get(COOKIE_SESSAO)?.value),
);

export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/entrar");
  return u;
}

export async function gravarCookieDeSessao(token: string) {
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_DIAS * 24 * 60 * 60,
  });
}

export async function apagarCookieDeSessao() {
  (await cookies()).delete(COOKIE_SESSAO);
}

export type PapelariaDoPainel = {
  id: string;
  nome: string;
  slug: string;
};

/** A papelaria de quem está no painel. Quem decide qual é a RLS. */
export const papelariaAtual = cache(async (usuarioId: string): Promise<PapelariaDoPainel | null> =>
  comoUsuario(usuarioId, async (q) => {
    const r = await q<PapelariaDoPainel>("select id, nome, slug from public.fornecedor order by criado_em limit 1");
    return r.rows[0] ?? null;
  }),
);
