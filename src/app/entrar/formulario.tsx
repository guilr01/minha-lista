"use client";

import Link from "next/link";
import { useActionState } from "react";
import { entrarAcao, type EstadoDeEntrada } from "@/app/acoes-acesso";
import { Aviso, botao, campo, cartao, link, rotuloCampo } from "@/components/ui";

export function FormularioDeEntrada() {
  const [estado, acao, enviando] = useActionState<EstadoDeEntrada, FormData>(entrarAcao, {});
  return (
    <form action={acao} className={`${cartao} flex flex-col gap-3.5 p-[22px]`}>
      {estado.erro && <div role="alert"><Aviso>{estado.erro}</Aviso></div>}
      <label className={rotuloCampo}>
        E-mail
        <input name="email" type="email" required autoComplete="email" defaultValue={estado.email} className={campo} />
      </label>
      <label className={rotuloCampo}>
        Senha
        <input name="senha" type="password" required autoComplete="current-password" className={campo} />
      </label>
      <button type="submit" className={botao} disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
      <p className="text-center text-sm text-apagado">
        Ainda não tem conta? <Link href="/cadastro" className={link}>Cadastrar a papelaria</Link>
      </p>
    </form>
  );
}
