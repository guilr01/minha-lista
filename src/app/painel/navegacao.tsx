"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone, type NomeIcone } from "@/components/icone";

const ITENS: { href: string; rotulo: string; curto?: string; icone: NomeIcone; tambem?: string[] }[] = [
  { href: "/painel", rotulo: "Pedidos", icone: "lista", tambem: ["/painel/pedidos"] },
  { href: "/painel/catalogo", rotulo: "Catálogo", icone: "etiqueta" },
  { href: "/painel/escolas", rotulo: "Escolas e listas", curto: "Escolas", icone: "escola", tambem: ["/painel/listas"] },
  { href: "/painel/loja", rotulo: "Loja", icone: "loja" },
];

export function NavegacaoDoPainel({ compacta = false }: { compacta?: boolean }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Painel" className={compacta ? "flex gap-1.5 overflow-x-auto" : "flex flex-col gap-1.5"}>
      {ITENS.map((i) => {
        const ativo = caminho === i.href
          || (i.href !== "/painel" && caminho.startsWith(i.href + "/"))
          || (i.tambem ?? []).some((t) => caminho.startsWith(t));
        return (
          <Link key={i.href} href={i.href} aria-current={ativo ? "page" : undefined}
            className={`flex min-h-11 flex-none items-center gap-2.5 rounded-campo px-3 text-[15px] ${
              ativo ? "bg-amarelo font-bold text-tinta" : "font-medium text-[#d6dce4] hover:bg-[#26364a] hover:text-white"}`}>
            {!compacta && <Icone nome={i.icone} tamanho={18} />}{compacta ? (i.curto ?? i.rotulo) : i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
