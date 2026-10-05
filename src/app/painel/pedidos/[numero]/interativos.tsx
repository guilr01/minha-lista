"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { avancarAcao, marcarItemAcao } from "@/app/painel/acoes";
import { Icone } from "@/components/icone";
import { ChipFaixa, botaoContornoPequeno, botaoPequeno, cartao } from "@/components/ui";
import type { PedidoDoPainel } from "@/lib/painel";

type Item = PedidoDoPainel["itens"][number];

/** O checklist de separação. A marca aparece na hora; o servidor confirma. */
export function Checklist({ itens, habilitado }: { itens: Item[]; habilitado: boolean }) {
  const [, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [marcados, marcar] = useOptimistic(
    Object.fromEntries(itens.map((i) => [i.id, i.separado])) as Record<string, boolean>,
    (atual, [id, v]: [string, boolean]) => ({ ...atual, [id]: v }),
  );
  const feitos = itens.filter((i) => marcados[i.id]).length;

  return (
    <section className={`${cartao} overflow-hidden`} aria-label="Lista de separação">
      <div className="flex flex-col gap-2 border-b border-linha px-[18px] py-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-bold">{feitos} de {itens.length} itens separados</span>
          <span className="text-[13px] text-apagado">{habilitado ? "Marque conforme pega na prateleira" : "Separação encerrada"}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-linha-2" role="progressbar" aria-valuemin={0} aria-valuemax={itens.length} aria-valuenow={feitos}>
          <i className="block h-full rounded-full bg-ok" style={{ width: `${itens.length ? (feitos / itens.length) * 100 : 0}%` }} />
        </div>
        {erro && <span role="alert" className="text-sm font-semibold text-erro">{erro}</span>}
      </div>
      <ul>
        {itens.map((i) => {
          const on = marcados[i.id];
          return (
            <li key={i.id} className="border-b border-linha-2 last:border-b-0">
              <label className={`grid min-h-[54px] items-center gap-3 px-3.5 py-2.5 lg:px-[18px] ${habilitado ? "cursor-pointer" : "cursor-default"} grid-cols-[28px_minmax(0,1fr)_40px] lg:grid-cols-[32px_minmax(0,1fr)_auto_56px]`}>
                <input type="checkbox" className="size-5 accent-ok" checked={on} disabled={!habilitado}
                  onChange={(ev) => {
                    const v = ev.target.checked;
                    setErro(null);
                    iniciar(async () => {
                      marcar([i.id, v]);
                      const r = await marcarItemAcao(i.id, v);
                      if (r.erro) setErro(r.erro);
                    });
                  }} />
                <span className={`text-[15px] ${on ? "text-apagado line-through" : ""}`}>
                  {i.nome_produto} <span className="text-[13px] text-apagado">· {i.marca}</span>
                </span>
                <span className="hidden lg:inline"><ChipFaixa faixa={i.faixa} /></span>
                <span className="text-right text-[17px] font-bold">{i.quantidade}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function Avancar(p: { pedidoId: string; para: string; rotulo: string; bloqueado: boolean; faltam: number; final: boolean }) {
  const [estado, acao, enviando] = useActionState(avancarAcao, {});
  return (
    <form action={acao} className="flex flex-col items-end gap-1">
      <input type="hidden" name="pedido" value={p.pedidoId} />
      <input type="hidden" name="para" value={p.para} />
      <button type="submit" disabled={enviando || p.bloqueado}
        className={`${botaoPequeno} ${p.final ? "bg-ok hover:bg-[#246540]" : ""}`}>
        {enviando ? "Salvando…" : p.rotulo}
      </button>
      {p.bloqueado && <span className="text-[13px] text-apagado">Faltam {p.faltam} {p.faltam === 1 ? "item" : "itens"} para separar</span>}
      {estado.erro && <span role="alert" className="text-sm font-semibold text-erro">{estado.erro}</span>}
    </form>
  );
}

export function Imprimir() {
  return (
    <button type="button" className={botaoContornoPequeno} onClick={() => window.print()}>
      <Icone nome="lista" tamanho={18} />Imprimir lista e etiqueta
    </button>
  );
}
