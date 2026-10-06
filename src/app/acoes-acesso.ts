"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  RECUPERACAO_VALIDADE_MINUTOS,
  cadastrar,
  entrar,
  pedirRecuperacao,
  redefinirSenha,
  sair,
  type DadosDeCadastro,
} from "@/lib/autenticacao";
import { enviarEmail, mensagemDeRecuperacao } from "@/lib/email";
import { enderecoPublico } from "@/lib/endereco";
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

export type EstadoDeRecuperacao = { enviado?: boolean; erro?: string; email?: string };

export async function pedirRecuperacaoAcao(_: EstadoDeRecuperacao, f: FormData): Promise<EstadoDeRecuperacao> {
  const email = String(f.get("email") ?? "").trim();
  if (!email) return { erro: "Informe o e-mail da conta." };
  const h = await headers();
  const base = enderecoPublico(h.get("host"));
  const envio = await pedirRecuperacao(email, await origem());
  // A tela responde igual com ou sem conta; o e-mail sai depois da resposta.
  if (envio) {
    after(() =>
      enviarEmail(
        mensagemDeRecuperacao(envio.para, envio.nome, `${base}/entrar/redefinir/${envio.token}`, RECUPERACAO_VALIDADE_MINUTOS),
      ),
    );
  }
  return { enviado: true, email };
}

export type EstadoDeRedefinicao = { erro?: string; linkInvalido?: boolean };

export async function redefinirSenhaAcao(token: string, _: EstadoDeRedefinicao, f: FormData): Promise<EstadoDeRedefinicao> {
  const senha = String(f.get("senha") ?? "");
  if (senha !== String(f.get("confirmacao") ?? "")) return { erro: "As duas senhas não são iguais." };
  const r = await redefinirSenha(token, senha);
  if (!r.ok) return r.motivo === "link" ? { erro: r.mensagem, linkInvalido: true } : { erro: r.mensagem };
  await gravarCookieDeSessao(r.token);
  redirect("/painel");
}
