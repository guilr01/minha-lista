"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icone } from "@/components/icone";
import { botao, campo, cartao, rotuloCampo } from "@/components/ui";
import type { VitrinePapelaria } from "@/lib/vitrine";

type Escola = VitrinePapelaria["escolas"][number];

/**
 * Uma caixa só, com duas listas suspensas: a escola e, depois dela, as séries
 * que essa escola tem com lista publicada. O botão leva ao mesmo endereço que
 * a papelaria divulga para a turma.
 *
 * Sem JavaScript: a escola volta para esta página com ?escola= (o servidor já
 * a traz escolhida) e as séries aparecem como links no <noscript>.
 */
export function EscolhaDaEscola({ papelaria, escolas, inicial }: { papelaria: string; escolas: Escola[]; inicial?: string }) {
  const router = useRouter();
  const [escolhida, setEscolhida] = useState(
    escolas.some((e) => e.slug === inicial) ? inicial! : escolas.length === 1 ? escolas[0].slug : "",
  );
  const escola = escolas.find((e) => e.slug === escolhida);
  const [serie, setSerie] = useState(escola?.series.length === 1 ? escola.series[0].slug : "");
  const [indo, setIndo] = useState(false);

  const trocarEscola = (slug: string) => {
    setEscolhida(slug);
    const e = escolas.find((x) => x.slug === slug);
    setSerie(e?.series.length === 1 ? e.series[0].slug : "");
  };

  return (
    <section className={`${cartao} flex flex-col gap-4 p-[18px] lg:p-6`} aria-label="Escolha a escola e a série">
      <form action={`/${papelaria}`} className="contents">
        <label className={rotuloCampo}>
          <span className="text-[15px] lg:text-base">Escola</span>
          <select name="escola" className={`${campo} h-[52px] text-base`} value={escolhida}
            onChange={(ev) => trocarEscola(ev.target.value)}>
            <option value="" disabled>Selecione a escola</option>
            {escolas.map((e) => (
              <option key={e.slug} value={e.slug}>{e.nome}{e.cidade ? ` · ${e.cidade}` : ""}</option>
            ))}
          </select>
        </label>
        <noscript>
          <button type="submit" className="min-h-11 font-semibold text-azul">Ver as séries</button>
        </noscript>
      </form>

      <form className="contents" onSubmit={(ev) => {
        ev.preventDefault();
        if (!escola || !serie) return;
        setIndo(true);
        router.push(`/${papelaria}/${escola.slug}/${serie}`);
      }}>
        <label className={rotuloCampo}>
          <span className={`text-[15px] lg:text-base ${escola ? "" : "text-apagado"}`}>Série</span>
          <select className={`${campo} h-[52px] text-base disabled:cursor-not-allowed disabled:bg-[#f6f3ec] disabled:text-apagado`}
            value={serie} disabled={!escola} onChange={(ev) => setSerie(ev.target.value)}>
            <option value="" disabled>{escola ? "Selecione a série" : "Escolha a escola primeiro"}</option>
            {escola?.series.map((s) => <option key={s.slug} value={s.slug}>{s.nome}</option>)}
          </select>
        </label>
        <button type="submit" className={botao} disabled={!escola || !serie || indo}>
          {indo ? "Abrindo a lista…" : <>Ver a lista <Icone nome="seta" tamanho={18} /></>}
        </button>
      </form>

      {escola && (
        <noscript>
          <ul className="flex flex-col gap-2">
            {escola.series.map((s) => (
              <li key={s.slug}><a href={`/${papelaria}/${escola.slug}/${s.slug}`} className="font-semibold text-azul">{s.nome}</a></li>
            ))}
          </ul>
        </noscript>
      )}
    </section>
  );
}
