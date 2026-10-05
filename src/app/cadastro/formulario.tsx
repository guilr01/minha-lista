"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { cadastrarAcao, type EstadoDeCadastro } from "@/app/acoes-acesso";
import { Aviso, botao, campo, cartao, link, rotuloCampo } from "@/components/ui";
import { sugerirSlug } from "@/lib/slug";

export function FormularioDeCadastro({ host }: { host: string }) {
  const [estado, acao, enviando] = useActionState<EstadoDeCadastro, FormData>(cadastrarAcao, {});
  const v = estado.valores ?? {};
  const [slug, setSlug] = useState(v.slug ?? "");
  const [slugTocado, setSlugTocado] = useState(Boolean(v.slug));
  const e = estado.erros ?? {};

  const erroDe = (k: keyof NonNullable<EstadoDeCadastro["erros"]>) =>
    e[k] ? <span className="text-xs font-semibold text-erro">{e[k]}</span> : null;
  const classe = (k: keyof NonNullable<EstadoDeCadastro["erros"]>) => `${campo} ${e[k] ? "border-erro bg-[#fff7f5]" : ""}`;

  return (
    <form action={acao} className={`${cartao} flex flex-col gap-3.5 p-[22px]`}>
      {estado.erro && <div role="alert"><Aviso>{estado.erro}</Aviso></div>}
      <label className={rotuloCampo}>
        Nome da papelaria
        <input name="papelaria" required defaultValue={v.papelaria} className={classe("papelaria")} aria-invalid={e.papelaria ? true : undefined}
          onChange={(ev) => { if (!slugTocado) setSlug(sugerirSlug(ev.target.value)); }} />
        {erroDe("papelaria")}
      </label>
      <label className={rotuloCampo}>
        Endereço do link
        <input name="slug" required value={slug} className={classe("slug")} aria-invalid={e.slug ? true : undefined}
          pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={60} autoCapitalize="none" spellCheck={false}
          onChange={(ev) => { setSlugTocado(true); setSlug(ev.target.value.toLowerCase()); }} />
        <span className="break-all text-[13px] font-normal text-apagado">{host}/<strong className="text-tinta">{slug || "sua-papelaria"}</strong></span>
        {erroDe("slug")}
      </label>
      <label className={rotuloCampo}>
        Seu nome
        <input name="nome" required autoComplete="name" defaultValue={v.nome} className={classe("nome")} aria-invalid={e.nome ? true : undefined} />
        {erroDe("nome")}
      </label>
      <label className={rotuloCampo}>
        E-mail
        <input name="email" type="email" required autoComplete="email" defaultValue={v.email} className={classe("email")} aria-invalid={e.email ? true : undefined} />
        {erroDe("email")}
      </label>
      <label className={rotuloCampo}>
        Senha
        <input name="senha" type="password" required minLength={8} autoComplete="new-password" className={classe("senha")} aria-invalid={e.senha ? true : undefined} />
        <span className="text-[13px] font-normal text-apagado">Pelo menos 8 caracteres.</span>
        {erroDe("senha")}
      </label>
      <button type="submit" className={botao} disabled={enviando}>{enviando ? "Criando a conta…" : "Criar conta"}</button>
      <p className="text-center text-sm text-apagado">
        Já tem conta? <Link href="/entrar" className={link}>Entrar</Link>
      </p>
    </form>
  );
}
