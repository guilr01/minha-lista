"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone } from "@/components/icone";

const ITENS = [{ href: "/painel", rotulo: "Pedidos", icone: "lista" as const }];

export function NavegacaoDoPainel({ compacta = false }: { compacta?: boolean }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Painel" className={compacta ? "flex gap-1.5 overflow-x-auto" : "flex flex-col gap-1.5"}>
      {ITENS.map((i) => {
        const ativo = caminho === i.href || caminho.startsWith(i.href + "/pedidos");
        return (
          <Link key={i.href} href={i.href} aria-current={ativo ? "page" : undefined}
            className={`flex min-h-11 flex-none items-center gap-2.5 rounded-campo px-3 text-[15px] ${
              ativo ? "bg-amarelo font-bold text-tinta" : "font-medium text-[#d6dce4] hover:bg-[#26364a] hover:text-white"}`}>
            <Icone nome={i.icone} tamanho={18} />{i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
