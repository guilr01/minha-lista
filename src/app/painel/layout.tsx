import type { Metadata } from "next";
import Link from "next/link";
import { sairAcao } from "@/app/acoes-acesso";
import { Icone } from "@/components/icone";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { NavegacaoDoPainel } from "./navegacao";

export const metadata: Metadata = { title: { default: "Painel", template: "%s · Painel" }, robots: { index: false } };

// A moldura escura do protótipo: lateral no desktop, cabeçalho com abas no
// celular. Barrar aqui protege a PÁGINA; cada ação confere de novo.
export default async function MolduraDoPainel({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  const papelaria = await papelariaAtual(usuario.id);

  const marca = (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="flex size-[34px] flex-none items-center justify-center rounded-campo bg-amarelo font-titulo text-lg font-bold text-tinta">
        {(papelaria?.nome ?? "?").charAt(0)}
      </span>
      <span className="titulo truncate text-[17px] font-bold text-white">{papelaria?.nome ?? "Lista Pronta"}</span>
    </span>
  );
  const sair = (
    <form action={sairAcao}>
      <button type="submit" className="min-h-11 text-sm font-semibold text-[#c9d1db] hover:text-white">Sair</button>
    </form>
  );

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row print:block">
      <aside className="sticky top-0 hidden h-dvh w-60 flex-none flex-col gap-1.5 self-start bg-tinta px-3.5 py-5 lg:flex print:hidden">
        <div className="px-2 pb-5">{marca}</div>
        <NavegacaoDoPainel />
        {papelaria && (
          <Link href={`/${papelaria.slug}`} target="_blank"
            className="flex min-h-11 items-center gap-2.5 rounded-campo px-3 text-[15px] text-[#d6dce4] hover:bg-[#26364a] hover:text-white">
            <Icone nome="loja" tamanho={18} />Página da papelaria
          </Link>
        )}
        <div className="mt-auto flex flex-col gap-1 border-t border-[#2c3a4c] px-3 pt-3 text-[13px] leading-snug text-[#9aa6b4]">
          <span className="truncate" title={usuario.email}>{usuario.nome ?? usuario.email}</span>
          {sair}
        </div>
      </aside>

      <header className="sticky top-0 z-10 bg-tinta lg:hidden print:hidden">
        <div className="flex min-h-[56px] items-center justify-between gap-3 px-4">{marca}{sair}</div>
        <div className="border-t border-[#2c3a4c] px-3 py-2.5"><NavegacaoDoPainel compacta /></div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-12 pt-[18px] lg:px-8 lg:pt-7 print:p-0">
        {papelaria ? children : (
          <p className="text-apagado">Esta conta não está ligada a nenhuma papelaria.</p>
        )}
      </main>
    </div>
  );
}
