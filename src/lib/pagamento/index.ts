import "server-only";
import { provedorFake } from "./fake";
import type { PaymentProvider } from "./tipos";

export type * from "./tipos";

const PROVEDORES: Record<string, PaymentProvider> = {
  fake: provedorFake,
};

export function provedorDePagamento(): PaymentProvider {
  const nome = process.env.PAGAMENTO_PROVEDOR ?? "fake";
  const p = PROVEDORES[nome];
  if (!p) throw new Error(`PAGAMENTO_PROVEDOR desconhecido: ${nome}`);
  return p;
}

/**
 * O botão "Simular pagamento aprovado" marca pedido como pago sem dinheiro
 * nenhum. Fora do desenvolvimento ele só existe com a liberação explícita
 * (para demonstração), senão qualquer pessoa levaria o material de graça.
 */
export function simulacaoLiberada(): boolean {
  if (provedorDePagamento().nome !== "fake") return false;
  return process.env.NODE_ENV !== "production" || process.env.PAGAMENTO_FAKE_LIBERADO === "1";
}
