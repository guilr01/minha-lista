"use server";

import { revalidatePath } from "next/cache";
import { comoUsuario } from "@/lib/db";
import { notificarMudancaDeStatus } from "@/lib/notificacao";
import { exigirUsuario } from "@/lib/sessao";
import type { StatusPedido } from "@/lib/vitrine";

// Ações do painel. Cada uma confere a sessão de novo (exigirUsuario) e roda
// como `authenticated`: quem recusa pedido de outra papelaria, transição
// inválida e despacho com item faltando é o banco.

const MENSAGENS: Record<string, string> = {
  separacao_incompleta: "Marque todos os itens como separados antes.",
  separacao_encerrada: "Este pedido já saiu da separação.",
  transicao_invalida: "O pedido já mudou de status. Recarregue a página.",
  pedido_inexistente: "Pedido não encontrado.",
  item_inexistente: "Item não encontrado.",
};

function traduzir(e: unknown): string {
  const codigo = (e instanceof Error ? e.message : "").split(":")[0];
  if (MENSAGENS[codigo]) return MENSAGENS[codigo];
  console.error("[painel]", e);
  return "Não foi possível salvar agora. Tente de novo.";
}

export async function marcarItemAcao(itemId: string, separado: boolean): Promise<{ erro?: string }> {
  const u = await exigirUsuario();
  try {
    const r = await comoUsuario(u.id, (q) =>
      q<{ r: { pedido_id: string; numero: number; status: StatusPedido; mudou_status: boolean } }>(
        "select public.marcar_item_separado($1, $2) as r",
        [itemId, separado],
      ),
    );
    const res = r.rows[0].r;
    if (res.mudou_status) {
      await notificarMudancaDeStatus({ pedidoId: res.pedido_id, numero: res.numero, status: res.status });
    }
  } catch (e) {
    return { erro: traduzir(e) };
  }
  revalidatePath("/painel", "layout");
  return {};
}

export async function avancarAcao(_: { erro?: string }, f: FormData): Promise<{ erro?: string }> {
  const u = await exigirUsuario();
  const pedidoId = String(f.get("pedido") ?? "");
  const para = String(f.get("para") ?? "") as StatusPedido;
  try {
    const r = await comoUsuario(u.id, (q) =>
      q<{ r: { pedido_id: string; numero: number; status: StatusPedido } }>(
        "select public.avancar_pedido($1, $2) as r",
        [pedidoId, para],
      ),
    );
    const res = r.rows[0].r;
    await notificarMudancaDeStatus({ pedidoId: res.pedido_id, numero: res.numero, status: res.status });
  } catch (e) {
    return { erro: traduzir(e) };
  }
  revalidatePath("/painel", "layout");
  return {};
}
