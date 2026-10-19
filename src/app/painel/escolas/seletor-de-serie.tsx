"use client";

import { useState } from "react";
import { campo, rotuloCampo } from "@/components/ui";
import { SERIES_PADRAO } from "@/lib/series";

const OUTRA = "__outra";

/** A série vem de uma lista pronta; "Outra" abre um campo para digitar (Educação Infantil, por exemplo). */
export function SeletorDeSerie({ existentes }: { existentes: string[] }) {
  const [escolha, setEscolha] = useState("");
  const ja = new Set(existentes);
  return (
    <>
      <label className={`${rotuloCampo} min-w-[220px] flex-1`}>
        Nova série
        <select name={escolha === OUTRA ? undefined : "nome"} required className={campo} value={escolha} onChange={(e) => setEscolha(e.target.value)}>
          <option value="" disabled>Escolha a série…</option>
          {SERIES_PADRAO.map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {g.nomes.map((n) => <option key={n} value={n} disabled={ja.has(n)}>{n}{ja.has(n) ? " (já cadastrada)" : ""}</option>)}
            </optgroup>
          ))}
          <option value={OUTRA}>Outra série (digitar)</option>
        </select>
      </label>
      {escolha === OUTRA && (
        <label className={`${rotuloCampo} min-w-[200px] flex-1`}>
          Nome da série
          <input name="nome" required autoFocus className={campo} placeholder="Ex.: Infantil 5" />
        </label>
      )}
    </>
  );
}
