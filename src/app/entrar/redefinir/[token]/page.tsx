import type { Metadata } from "next";
import Link from "next/link";
import { MolduraDeAcesso } from "@/components/acesso";
import { botao, cartao } from "@/components/ui";
import { SENHA_MINIMA, recuperacaoValida } from "@/lib/autenticacao";
import { FormularioDeRedefinicao } from "./formulario";

// O token está no endereço: a página não manda o endereço para lugar nenhum.
export const metadata: Metadata = { title: "Criar senha nova", referrer: "no-referrer", robots: { index: false } };

export default async function Redefinir({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await recuperacaoValida(token))) {
    return (
      <MolduraDeAcesso titulo="Link expirado" subtitulo="Este link de senha nova expirou ou já foi usado.">
        <div className={`${cartao} flex flex-col gap-3.5 p-[22px] text-[15px] leading-relaxed`}>
          <p>Cada link vale por 1 hora e funciona uma vez só. Pedir um novo invalida os anteriores.</p>
          <Link href="/entrar/esqueci" className={botao}>Pedir um link novo</Link>
        </div>
      </MolduraDeAcesso>
    );
  }
  return (
    <MolduraDeAcesso titulo="Criar senha nova" subtitulo="Depois de salvar, você entra direto no painel.">
      <FormularioDeRedefinicao token={token} minimo={SENHA_MINIMA} />
    </MolduraDeAcesso>
  );
}
