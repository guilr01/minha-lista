"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";

export type EstadoDaAcao = { erro?: string; ok?: string };

// Formulário de Server Action com a resposta ao lado: o erro que o banco deu,
// em português, e a confirmação para ação que apaga.
//
// O envio é feito aqui (onSubmit), e não pelo `action` do React, de
// propósito: no React 19 o form com action é LIMPO depois do envio, mesmo
// quando o banco recusa, e quem digitou um produto inteiro perderia tudo por
// um preço inválido. Só limpa quando `limparAoSalvar` e deu certo. Sem
// JavaScript, o `action` continua valendo como envio comum.
export function FormAcao({
  acao,
  children,
  className,
  confirmar,
  limparAoSalvar = false,
}: {
  acao: (estado: EstadoDaAcao, f: FormData) => Promise<EstadoDaAcao>;
  children: React.ReactNode;
  className?: string;
  confirmar?: string;
  limparAoSalvar?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const form = useRef<HTMLFormElement>(null);
  const envios = useRef(0);
  const ultimoLimpo = useRef(0);

  useEffect(() => {
    if (limparAoSalvar && !pendente && envios.current > ultimoLimpo.current && !estado.erro) {
      ultimoLimpo.current = envios.current;
      form.current?.reset();
    }
  }, [estado, pendente, limparAoSalvar]);

  return (
    <form ref={form} action={enviar} className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmar && !window.confirm(confirmar)) return;
        const dados = new FormData(e.currentTarget);
        envios.current += 1;
        startTransition(() => enviar(dados));
      }}>
      <fieldset disabled={pendente} className="contents">{children}</fieldset>
      {estado.erro && <p role="alert" className="basis-full text-sm font-semibold text-erro">{estado.erro}</p>}
      {estado.ok && <p role="status" className="basis-full text-sm font-semibold text-ok">{estado.ok}</p>}
    </form>
  );
}
