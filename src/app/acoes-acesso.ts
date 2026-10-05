"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cadastrar, entrar, sair, type DadosDeCadastro } from "@/lib/autenticacao";
import { COOKIE_SESSAO, apagarCookieDeSessao, gravarCookieDeSessao } from "@/lib/sessao";

export type EstadoDeEntrada = { erro?: string; email?: string };

async function origem(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function entrarAcao(_: EstadoDeEntrada, f: FormData): Promise<EstadoDeEntrada> {
  const email = String(f.get("email") ?? "");
  const senha = String(f.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe o e-mail e a senha.", email };
  const r = await entrar(email, senha, await origem());
  if (!r.ok) {
    return {
      email,
      erro: r.motivo === "bloqueado"
        ? "Muitas tentativas seguidas. Espere 15 minutos e tente de novo."
        : "E-mail ou senha incorretos.",
    };
  }
  await gravarCookieDeSessao(r.token);
  redirect("/painel");
}

export type EstadoDeCadastro = {
  erros?: Partial<Record<keyof DadosDeCadastro, string>>;
  erro?: string;
  valores?: Partial<DadosDeCadastro>;
};

export async function cadastrarAcao(_: EstadoDeCadastro, f: FormData): Promise<EstadoDeCadastro> {
  const d: DadosDeCadastro = {
    papelaria: String(f.get("papelaria") ?? ""),
    slug: String(f.get("slug") ?? "").trim().toLowerCase(),
    nome: String(f.get("nome") ?? ""),
    email: String(f.get("email") ?? ""),
    senha: String(f.get("senha") ?? ""),
  };
  const valores = { papelaria: d.papelaria, slug: d.slug, nome: d.nome, email: d.email };
  const r = await cadastrar(d);
  if (!r.ok) {
    return r.campo ? { erros: { [r.campo]: r.mensagem }, valores } : { erro: r.mensagem, valores };
  }
  await gravarCookieDeSessao(r.token);
  redirect("/painel");
}

export async function sairAcao() {
  await sair((await cookies()).get(COOKIE_SESSAO)?.value);
  await apagarCookieDeSessao();
  redirect("/entrar");
}
