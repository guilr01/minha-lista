"use client";

import Link from "next/link";
import { useState } from "react";
import { Icone } from "@/components/icone";
import { campo, cartao, rotuloCampo } from "@/components/ui";
import type { VitrinePapelaria } from "@/lib/vitrine";

type Escola = VitrinePapelaria["escolas"][number];

/**
 * Uma caixa só: escolhe a escola e aparecem as séries dela. Cada série é um
 * link de verdade, o mesmo endereço que a papelaria divulga para a turma.
 * Sem JavaScript, o seletor ainda funciona: o formulário volta para esta
 * página com ?escola=, e o servidor já a traz escolhida.
 */
export function EscolhaDaEscola({ papelaria, escolas, inicial }: { papelaria: string; escolas: Escola[]; inicial?: string }) {
  const [escolhida, setEscolhida] = useState(
    escolas.some((e) => e.slug === inicial) ? inicial! : escolas.length === 1 ? escolas[0].slug : "",
  );
  const escola = escolas.find((e) => e.slug === escolhida);

  return (
    <section className={`${cartao} flex flex-col gap-4 p-[18px] lg:p-6`} aria-label="Escolha a escola e a série">
      <form action={`/${papelaria}`} className="contents">
        <label className={rotuloCampo}>
          <span className="text-[15px]">Escola</span>
          <select name="escola" className={`${campo} h-[52px] text-base`} value={escolhida}
            onChange={(ev) => setEscolhida(ev.target.value)}>
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

      {escola ? (
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold">Série</span>
          <ul className="grid gap-2 sm:grid-cols-2">
            {escola.series.map((s) => (
              <li key={s.slug}>
                <Link href={`/${papelaria}/${escola.slug}/${s.slug}`}
                  className="flex min-h-[52px] items-center justify-between rounded-xl border border-campo bg-white px-4 text-[15px] font-semibold hover:border-azul hover:bg-azul-fundo">
                  <span>{s.nome}</span>
                  <span className="flex items-center gap-1 text-sm text-azul">Ver a lista <Icone nome="seta" tamanho={18} /></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-apagado">Escolha a escola para ver as séries com lista publicada.</p>
      )}
    </section>
  );
}
