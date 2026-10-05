import "server-only";
import { comoSistema } from "@/lib/db";
import { notificarMudancaDeStatus } from "@/lib/notificacao";
import type { EventoDePagamento } from "./tipos";

/**
 * O ÚNICO caminho que marca um pedido como pago: o webhook do gateway e a
 * simulação do provedor falso chamam esta função. Idempotente.
 */
export async function aplicarEventoDePagamento(provedor: string, evento: EventoDePagamento) {
  const r = await comoSistema((q) =>
    q<{ r: { pedido_id: string; fornecedor_id: string; numero: number; status: string; mudou: boolean } }>(
      "select app.confirmar_pagamento($1, $2, $3) as r",
      [provedor, evento.idExterno, evento.status],
    ),
  );
  const res = r.rows[0].r;
  if (res.mudou) {
    await notificarMudancaDeStatus({
      pedidoId: res.pedido_id,
      fornecedorId: res.fornecedor_id,
      numero: res.numero,
      status: res.status,
    });
  }
  return res;
}
