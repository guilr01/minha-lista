"use client";

import { useEffect, useRef, useState } from "react";
import { campo } from "@/components/ui";
import { paraBusca } from "@/lib/texto";

// Filtra as linhas já desenhadas pelo atributo data-busca. Sem JavaScript, a
// lista inteira aparece; o filtro é conveniência, não regra.
export function BuscaDoCatalogo({ children }: { children: React.ReactNode }) {
  const [termo, setTermo] = useState("");
  const area = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = paraBusca(termo);
    area.current?.querySelectorAll<HTMLElement>("[data-busca]").forEach((el) => {
      el.hidden = Boolean(t) && !(el.dataset.busca ?? "").includes(t);
    });
  }, [termo]);
  return (
    <>
      <label className="my-4 block max-w-[360px]">
        <span className="sr-only">Buscar produto</span>
        <input className={campo} placeholder="Buscar produto, categoria ou marca…" value={termo} onChange={(e) => setTermo(e.target.value)} />
      </label>
      <div ref={area}>{children}</div>
    </>
  );
}
