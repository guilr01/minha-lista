"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { simularPagamento } from "@/app/acoes-pedido";
import { Informacao, botao, campo, cartao, rotuloCampo } from "@/components/ui";
import { reais } from "@/lib/dinheiro";

const so = (v: string) => v.replace(/\D/g, "");

export function CartaoFalso(p: { token: string; total: number; parcelas: number; papelaria: string; numero: number }) {
  const router = useRouter();
  const [c, setC] = useState({ numero: "", nome: "", validade: "", cvv: "" });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [ocupado, iniciar] = useTransition();

  const pagar = (aprovado: boolean) => {
    const e: Record<string, string> = {};
    if (aprovado) {
      if (so(c.numero).length !== 16) e.numero = "Número com 16 dígitos";
      if (!c.nome.trim()) e.nome = "Nome como no cartão";
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(c.validade)) e.validade = "Use MM/AA";
      if (so(c.cvv).length < 3) e.cvv = "3 ou 4 dígitos";
    }
    setErros(e);
    if (Object.keys(e).length) return;
    iniciar(async () => {
      // Os dígitos do cartão NÃO vão ao servidor: só a decisão da simulação.
      await simularPagamento(p.token, aprovado);
      router.push(`/pedido/${p.token}`);
    });
  };

  const f = (k: keyof typeof c, rotulo: string, dica: string, mascara: (v: string) => string) => (
    <label className={rotuloCampo}>
      {rotulo}
      <input className={`${campo} ${erros[k] ? "border-erro bg-[#fff7f5]" : ""}`} value={c[k]} placeholder={dica}
        inputMode={k === "nome" ? undefined : "numeric"} autoComplete="off" aria-invalid={erros[k] ? true : undefined}
        onChange={(e) => setC((a) => ({ ...a, [k]: mascara(e.target.value) }))} />
      {erros[k] && <span className="text-xs font-semibold text-erro">{erros[k]}</span>}
    </label>
  );

  return (
    <main className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-5 py-8">
      <h1 className="titulo text-[26px] font-bold">Pagamento com cartão</h1>
      <p className="-mt-2 text-[15px] text-apagado">
        {p.papelaria} · pedido #{p.numero} · {p.parcelas}x de {reais(Math.ceil(p.total / p.parcelas))} sem juros
      </p>
      <section className={`${cartao} flex flex-col gap-3 p-[22px]`}>
        {f("numero", "Número do cartão", "0000 0000 0000 0000", (v) => so(v).slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 "))}
        {f("nome", "Nome impresso no cartão", "", (v) => v)}
        <div className="grid grid-cols-2 gap-3">
          {f("validade", "Validade", "MM/AA", (v) => { const d = so(v).slice(0, 4); return d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d; })}
          {f("cvv", "CVV", "123", (v) => so(v).slice(0, 4))}
        </div>
        <Informacao>
          Página de teste no lugar do meio de pagamento. Nenhum dado é enviado e qualquer número com 16 dígitos é aceito.
        </Informacao>
        <button type="button" className={botao} disabled={ocupado} onClick={() => pagar(true)}>
          {ocupado ? "Processando…" : `Pagar ${reais(p.total)}`}
        </button>
        <button type="button" className="min-h-11 text-sm font-semibold text-erro hover:underline" disabled={ocupado} onClick={() => pagar(false)}>
          Simular cartão recusado
        </button>
      </section>
    </main>
  );
}
