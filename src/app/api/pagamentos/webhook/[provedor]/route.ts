import { provedorDePagamento, simulacaoLiberada } from "@/lib/pagamento";
import { aplicarEventoDePagamento } from "@/lib/pagamento/processar";

// O gateway avisa aqui quando um pagamento muda. Quem valida a assinatura é a
// implementação do provedor; quem marca o pedido como pago é o mesmo
// aplicarEventoDePagamento da simulação.
export async function POST(req: Request, { params }: { params: Promise<{ provedor: string }> }) {
  const provedor = provedorDePagamento();
  if ((await params).provedor !== provedor.nome) return new Response(null, { status: 404 });
  // O falso não tem assinatura: aberto, ele marcaria qualquer pedido como pago.
  if (provedor.nome === "fake" && !simulacaoLiberada()) return new Response(null, { status: 404 });

  const evento = await provedor.interpretarWebhook(req);
  if (!evento) return new Response(null, { status: 400 });
  try {
    await aplicarEventoDePagamento(provedor.nome, evento);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("pagamento_inexistente")) return new Response(null, { status: 404 });
    throw e;
  }
  return Response.json({ ok: true });
}
