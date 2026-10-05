import "server-only";

// Ponto de integração do WhatsApp (fora do escopo agora). Toda mudança de
// status de pedido passa por aqui; a implementação de verdade enviará a
// mensagem ao responsável. Hoje só registra no log do servidor.

export interface MudancaDeStatus {
  pedidoId: string;
  fornecedorId?: string;
  numero: number;
  status: string;
}

export async function notificarMudancaDeStatus(m: MudancaDeStatus): Promise<void> {
  console.info(`[notificacao] pedido #${m.numero} (${m.pedidoId}) → ${m.status}`);
}
