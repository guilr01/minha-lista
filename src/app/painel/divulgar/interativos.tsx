"use client";

import { useState } from "react";
import { Icone } from "@/components/icone";
import { botaoContornoPequeno, botaoPequeno } from "@/components/ui";

export function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button type="button" className={`${botaoPequeno} flex-none`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        } catch {
          // sem permissão de área de transferência: o texto está na tela
          window.prompt("Copie o link:", texto);
        }
      }}>
      <Icone nome={copiado ? "check" : "copiar"} tamanho={18} />
      <span aria-live="polite">{copiado ? "Copiado" : rotulo}</span>
    </button>
  );
}

export function ImprimirCartaz() {
  return (
    <button type="button" className={botaoContornoPequeno} onClick={() => window.print()}>
      <Icone nome="imprimir" tamanho={18} />Imprimir cartaz
    </button>
  );
}
