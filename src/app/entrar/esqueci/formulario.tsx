"use client";

import Link from "next/link";
import { useActionState } from "react";
import { pedirRecuperacaoAcao, type EstadoDeRecuperacao } from "@/app/acoes-acesso";
import { Aviso, botao, campo, cartao, link, rotuloCampo } from "@/components/ui";

export function FormularioDeRecuperacao() {
  const [estado, acao, enviando] = useActionState<EstadoDeRecuperacao, FormData>(pedirRecuperacaoAcao, {});

  if (estado.enviado) {
    // A mesma resposta com ou sem conta: dizer "não há conta com este
    // e-mail" contaria a qualquer um quem é cliente.
    return (
      <div className={`${cartao} flex flex-col gap-3 p-[22px] text-[15px] leading-relaxed`} role="status">
        <p>
          Se houver uma conta com <strong className="break-all">{estado.email}</strong>, enviamos para ele um link
          para criar uma senha nova.
        </p>
        <p className="text-sm text-apagado">
          O link vale por 1 hora e só funciona uma vez. Não chegou? Olhe a caixa de spam ou peça de novo daqui a
          alguns minutos.
        </p>
        <Link href="/entrar" className={`${link} text-sm`}>Voltar para entrar</Link>
      </div>
    );
  }

  return (
    <form action={acao} className={`${cartao} flex flex-col gap-3.5 p-[22px]`}>
      {estado.erro && <div role="alert"><Aviso>{estado.erro}</Aviso></div>}
      <label className={rotuloCampo}>
        E-mail da conta
        <input name="email" type="email" required autoComplete="email" defaultValue={estado.email} className={campo} />
      </label>
      <button type="submit" className={botao} disabled={enviando}>{enviando ? "Enviando…" : "Enviar o link"}</button>
      <p className="text-center text-sm text-apagado">
        Lembrou? <Link href="/entrar" className={link}>Voltar para entrar</Link>
      </p>
    </form>
  );
}
