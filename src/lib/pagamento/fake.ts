import { randomBytes } from "node:crypto";
import type { Cobranca, NovaCobranca, PaymentProvider, StatusPagamento } from "./tipos";

// Provedor de mentira, para desenvolver sem gateway. Nenhum dinheiro passa
// por aqui. A aprovação é feita à mão pela tela (simulacaoLiberada) e passa
// pelo mesmo caminho do webhook de um gateway de verdade.

function pixDeMentira(c: NovaCobranca, id: string): string {
  // Formato parecido com o EMV do Pix, para a tela ter algo realista para
  // copiar. Não é pagável: a chave não existe.
  const valor = (c.valorCentavos / 100).toFixed(2);
  return `00020126580014BR.GOV.BCB.PIX0136${id}5204000053039865406${valor}5802BR5913LISTA PRONTA6009SAO PAULO62070503***6304FAKE`;
}

export const provedorFake: PaymentProvider = {
  nome: "fake",

  async criarCobranca(c: NovaCobranca): Promise<Cobranca> {
    const idExterno = "fake_" + randomBytes(12).toString("hex");
    if (c.metodo === "pix") {
      const expiraEm = new Date(Date.now() + 30 * 60_000).toISOString();
      return { idExterno, status: "pendente", pix: { copiaECola: pixDeMentira(c, idExterno), expiraEm } };
    }
    // O "checkout do gateway" do falso é uma página nossa que imita um.
    return { idExterno, status: "pendente", urlCartao: `/pagamento-fake/${idExterno}` };
  },

  async consultar(): Promise<StatusPagamento> {
    return "pendente";
  },

  async interpretarWebhook(req: Request) {
    const corpo = (await req.json().catch(() => null)) as { idExterno?: string; status?: StatusPagamento } | null;
    if (!corpo?.idExterno || !corpo.status) return null;
    return { idExterno: corpo.idExterno, status: corpo.status };
  },
};
