"use server";

import { headers } from "next/headers";
import { cobrancaPendente, criarPedido, gerarCobranca, type EntradaDoPedido } from "@/lib/area-publica";
import { traduzirErro } from "@/lib/erros";
import { provedorDePagamento, simulacaoLiberada } from "@/lib/pagamento";
import { aplicarEventoDePagamento } from "@/lib/pagamento/processar";

// Ações do pai. Server Action é endpoint público (qualquer um faz o POST),
// e por isso nada aqui confia na entrada: o preço e a validação são do banco.

async function origem() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

type Resultado =
  | { ok: true; token: string; numero: number; total_centavos: number; urlCartao: string | null }
  | { ok: false; erro: string; codigo?: string };

export async function fazerPedido(entrada: EntradaDoPedido): Promise<Resultado> {
  let pedido;
  try {
    pedido = await criarPedido(entrada);
  } catch (e) {
    const t = traduzirErro(e);
    if (t) return { ok: false, erro: t.mensagem, codigo: t.codigo };
    console.error("[fazerPedido]", e);
    return { ok: false, erro: "Não foi possível criar o pedido agora. Tente de novo em instantes." };
  }
  // O pedido já existe. Se o provedor falhar, a página do pedido oferece
  // gerar o pagamento de novo; o pai não perde o que montou.
  let urlCartao: string | null = null;
  try {
    urlCartao = (await gerarCobranca(pedido.token, await origem())).urlCartao;
  } catch (e) {
    console.error("[fazerPedido] cobrança", e);
  }
  return { ok: true, token: pedido.token, numero: pedido.numero, total_centavos: pedido.total_centavos, urlCartao };
}

export async function gerarPagamentoDeNovo(token: string): Promise<{ urlCartao: string | null } | { erro: string }> {
  try {
    return await gerarCobranca(token, await origem());
  } catch (e) {
    console.error("[gerarPagamentoDeNovo]", e);
    return { erro: "O pagamento não pôde ser gerado agora. Tente de novo em instantes." };
  }
}

/** Só existe com o provedor falso liberado. Passa pelo caminho do webhook. */
export async function simularPagamento(token: string, aprovado: boolean): Promise<{ ok: boolean }> {
  if (!simulacaoLiberada()) return { ok: false };
  const c = await cobrancaPendente(token);
  if (!c || c.provedor !== provedorDePagamento().nome) return { ok: false };
  await aplicarEventoDePagamento(c.provedor, { idExterno: c.id_externo, status: aprovado ? "aprovado" : "recusado" });
  return { ok: true };
}
