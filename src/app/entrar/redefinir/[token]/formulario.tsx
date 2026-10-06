"use client";

import Link from "next/link";
import { useActionState } from "react";
import { redefinirSenhaAcao, type EstadoDeRedefinicao } from "@/app/acoes-acesso";
import { Aviso, botao, campo, cartao, link, rotuloCampo } from "@/components/ui";

// O mínimo vem da página (servidor): importar src/lib/senha.ts aqui levaria
// o node:crypto para o navegador.
export function FormularioDeRedefinicao({ token, minimo }: { token: string; minimo: number }) {
  const [estado, acao, enviando] = useActionState<EstadoDeRedefinicao, FormData>(
    redefinirSenhaAcao.bind(null, token),
    {},
  );
  return (
    <form action={acao} className={`${cartao} flex flex-col gap-3.5 p-[22px]`}>
      {estado.erro && (
        <div role="alert">
          <Aviso>
            {estado.erro}
            {estado.linkInvalido && <> <Link href="/entrar/esqueci" className="font-semibold underline">Pedir um link novo</Link></>}
          </Aviso>
        </div>
      )}
      <label className={rotuloCampo}>
        Senha nova
        <input name="senha" type="password" required minLength={minimo} autoComplete="new-password" className={campo} />
        <span className="text-xs font-normal text-apagado">Pelo menos {minimo} caracteres.</span>
      </label>
      <label className={rotuloCampo}>
        Repita a senha nova
        <input name="confirmacao" type="password" required minLength={minimo} autoComplete="new-password" className={campo} />
      </label>
      <button type="submit" className={botao} disabled={enviando}>{enviando ? "Salvando…" : "Salvar e entrar"}</button>
      <p className="text-center text-sm text-apagado">
        As outras sessões abertas desta conta serão encerradas. <Link href="/entrar" className={link}>Voltar</Link>
      </p>
    </form>
  );
}
