"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { Aviso, botao, botaoContornoPequeno, cartao, link } from "@/components/ui";
import { reais } from "@/lib/dinheiro";
import { FAIXAS } from "@/lib/faixa";
import { conferirPlanilhaAcao, importarPlanilhaAcao, type Previa } from "./acoes";

// Dois passos com o MESMO arquivo: conferir (mostra o que vai entrar e o que
// tem problema) e importar. Nada é gravado no primeiro.
export function Importador() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [ocupado, iniciar] = useTransition();
  const [mostrarTodas, setMostrarTodas] = useState(false);

  const comArquivo = (fn: typeof conferirPlanilhaAcao) => {
    if (!arquivo) return;
    const f = new FormData();
    f.set("arquivo", arquivo);
    iniciar(async () => setPrevia(await fn(f)));
  };

  if (previa?.resultado) {
    const { criados, atualizados } = previa.resultado;
    return (
      <section className={`${cartao} flex flex-col gap-3 p-[18px]`} role="status">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ok"><Icone nome="check" />Catálogo importado</h2>
        <p className="text-[15px]">
          {criados} {criados === 1 ? "produto criado" : "produtos criados"} e {atualizados} {atualizados === 1 ? "atualizado" : "atualizados"}.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/painel/catalogo" className={botao}>Ver o catálogo</Link>
          <button type="button" className={botaoContornoPequeno} onClick={() => { setPrevia(null); setArquivo(null); }}>Importar outra planilha</button>
        </div>
      </section>
    );
  }

  const erros = previa?.erros ?? [];
  const amostra = previa?.amostra ?? [];
  const visiveis = mostrarTodas ? amostra : amostra.slice(0, 15);

  return (
    <section className={`${cartao} flex min-w-0 flex-col gap-4 p-[18px]`}>
      <h2 className="text-base font-bold">2. Suba o arquivo preenchido</h2>
      <label className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-campo bg-[#fbfaf6] px-4 text-center hover:border-azul">
        <Icone nome="lista" tamanho={26} className="text-azul" />
        <span className="font-semibold">{arquivo ? arquivo.name : "Escolher a planilha (.xlsx)"}</span>
        <span className="text-[13px] text-apagado">{arquivo ? "Toque para trocar" : "Excel, até 3 MB"}</span>
        <input type="file" className="sr-only"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => { setArquivo(e.target.files?.[0] ?? null); setPrevia(null); setMostrarTodas(false); }} />
      </label>

      {!previa && (
        <button type="button" className={botao} disabled={!arquivo || ocupado} onClick={() => comArquivo(conferirPlanilhaAcao)}>
          {ocupado ? "Conferindo…" : "Conferir a planilha"}
        </button>
      )}

      {previa?.erro && <div role="alert"><Aviso>{previa.erro}</Aviso></div>}

      {previa && !previa.erro && (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            {[["Produtos novos", previa.novos ?? 0], ["Atualizados", previa.atualizados ?? 0], ["Com problema", erros.length]].map(([t, n]) => (
              <div key={t} className="flex flex-col rounded-botao border border-linha bg-white px-3 py-2.5">
                <span className="text-[13px] font-bold text-apagado">{t}</span>
                <span className={`titulo text-2xl font-bold ${t === "Com problema" && Number(n) > 0 ? "text-erro" : ""}`}>{n}</span>
              </div>
            ))}
          </div>

          {erros.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-botao bg-aviso-fundo px-4 py-3.5 text-sm leading-snug text-aviso">
              <strong className="text-tinta">
                {erros.length} {erros.length === 1 ? "linha não vai entrar" : "linhas não vão entrar"}. Corrija na planilha e confira de novo, ou importe o resto.
              </strong>
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                {erros.map((e) => <li key={e.linha}><strong>Linha {e.linha}</strong>: {e.mensagem}</li>)}
              </ul>
            </div>
          )}

          {amostra.length > 0 && (
            <div className="overflow-x-auto rounded-botao border border-linha">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="bg-[#fbfaf6] text-left text-xs font-bold uppercase tracking-[0.04em] text-apagado">
                    {["Linha", "Produto", "Econômica", "Intermediária", "Premium"].map((t) => (
                      <th key={t} className="border-b border-linha px-3 py-2">{t}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((l) => (
                    <tr key={l.linha} className="border-b border-linha-2 last:border-b-0">
                      <td className="px-3 py-2 text-apagado">{l.linha}</td>
                      <td className="px-3 py-2">
                        <strong className="font-semibold">{l.nome}</strong>
                        <span className={`ml-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${l.novo ? "bg-ok-fundo text-ok" : "bg-azul-claro text-azul"}`}>
                          {l.novo ? "novo" : "atualiza"}
                        </span>
                      </td>
                      {FAIXAS.map((f) => {
                        const o = l.opcoes[f];
                        return (
                          <td key={f} className="px-3 py-2">
                            {o ? <><strong>{reais(o.preco_centavos)}</strong><span className="block text-[12px] text-apagado">{o.marca}</span></> : <span className="text-apagado">–</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {amostra.length > 15 && !mostrarTodas && (
            <button type="button" className={`${link} self-start text-sm`} onClick={() => setMostrarTodas(true)}>
              Mostrar as {amostra.length} linhas
            </button>
          )}

          <div className="flex flex-wrap gap-2.5">
            <button type="button" className={botao} disabled={ocupado || !amostra.length} onClick={() => comArquivo(importarPlanilhaAcao)}>
              {ocupado ? "Importando…" : `Importar ${amostra.length} ${amostra.length === 1 ? "produto" : "produtos"}`}
            </button>
            <button type="button" className={botaoContornoPequeno} disabled={ocupado} onClick={() => setPrevia(null)}>Conferir de novo</button>
          </div>
        </>
      )}
    </section>
  );
}
