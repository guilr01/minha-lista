"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { gerarPagamentoDeNovo, simularPagamento } from "@/app/acoes-pedido";
import { Icone } from "@/components/icone";
import { botaoContornoPequeno, botaoPequeno, campo } from "@/components/ui";

/** Enquanto espera o pagamento, a página se refaz sozinha para ver a confirmação. */
export function AtualizarSozinho({ segundos = 4 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}

export function CopiarCodigo({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="flex w-full max-w-[420px] gap-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Código Pix copia e cola</span>
        <input readOnly value={codigo} className={`${campo} h-11 font-mono text-xs`} onFocus={(e) => e.target.select()} />
      </label>
      <button type="button" className={botaoContornoPequeno}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(codigo);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          } catch {
            // sem permissão: o campo continua selecionável
          }
        }}>
        <Icone nome={copiado ? "check" : "copiar"} tamanho={18} />{copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

export function SimularPagamento({ token }: { token: string }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  return (
    <button type="button" className={`${botaoPequeno} w-full max-w-[420px]`} disabled={ocupado}
      onClick={() => iniciar(async () => {
        await simularPagamento(token, true);
        router.refresh();
      })}>
      {ocupado ? "Confirmando…" : "Simular pagamento aprovado"}
    </button>
  );
}

export function GerarDeNovo({ token }: { token: string }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={botaoPequeno} disabled={ocupado}
        onClick={() => iniciar(async () => {
          const r = await gerarPagamentoDeNovo(token);
          if ("erro" in r) return setErro(r.erro);
          if (r.urlCartao) router.push(r.urlCartao);
          else router.refresh();
        })}>
        {ocupado ? "Gerando…" : "Gerar o pagamento de novo"}
      </button>
      {erro && <p className="text-sm font-semibold text-erro">{erro}</p>}
    </>
  );
}
