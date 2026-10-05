"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Icone } from "@/components/icone";
import { botaoPequeno, cartao } from "@/components/ui";
import { reais } from "@/lib/dinheiro";
import { lerPedidos } from "@/lib/meus-pedidos";

// Lido do navegador: o servidor não sabe quais pedidos foram feitos aqui.
const nada = () => () => {};
let cache: { bruto: string | null; valor: ReturnType<typeof lerPedidos> } = { bruto: null, valor: [] };
function instantaneo() {
  let bruto: string | null = null;
  try {
    bruto = localStorage.getItem("lp:meus-pedidos");
  } catch {}
  if (bruto !== cache.bruto) cache = { bruto, valor: lerPedidos() };
  return cache.valor;
}
const vazio: ReturnType<typeof lerPedidos> = [];

export function MeusPedidos({ slug }: { slug: string }) {
  const todos = useSyncExternalStore(nada, instantaneo, () => vazio);
  const pedidos = todos.filter((p) => p.slug === slug);
  return (
    <main className="mx-auto w-full max-w-[880px] px-5 pb-10 pt-4 lg:px-10 lg:pt-8">
      <Link href={`/${slug}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-azul">
        <Icone nome="voltar" />Voltar
      </Link>
      <h1 className="titulo mt-1 text-[26px] font-bold lg:text-[34px]">Meus pedidos</h1>
      <p className="mt-1.5 text-[15px] text-apagado">
        Os pedidos feitos neste aparelho. O link que você recebeu também abre o acompanhamento de qualquer lugar.
      </p>
      {pedidos.length === 0 ? (
        <div className={`${cartao} mt-5 flex flex-col items-center gap-4 p-10 text-center text-apagado`}>
          Você ainda não fez nenhum pedido neste aparelho.
          <Link href={`/${slug}`} className={botaoPequeno}>Ver as listas</Link>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {pedidos.map((p) => (
            <li key={p.token}>
              <Link href={`/pedido/${p.token}`} className={`${cartao} flex flex-col gap-1.5 p-4 hover:border-[#9fb4cf]`}>
                <span className="flex items-center justify-between gap-3">
                  <strong className="text-base">Pedido #{p.numero}</strong>
                  <strong>{reais(p.total_centavos)}</strong>
                </span>
                <span className="text-[13px] text-apagado">
                  {p.aluno} · {p.lista} · {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                </span>
                <span className="text-sm font-semibold text-azul">Acompanhar</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
