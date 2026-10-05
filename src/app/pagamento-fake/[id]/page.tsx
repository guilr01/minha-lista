import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tokenDaCobranca } from "@/lib/area-publica";
import { simulacaoLiberada } from "@/lib/pagamento";
import { CartaoFalso } from "./cartao-falso";

export const metadata: Metadata = { title: "Pagamento com cartão (teste)", robots: { index: false } };

// Faz o papel da página segura do gateway, onde o cartão é digitado. Só
// existe com o provedor falso liberado; nada do que se digita sai do navegador.
export default async function PaginaDoCartaoFalso({ params }: { params: Promise<{ id: string }> }) {
  if (!simulacaoLiberada()) notFound();
  const c = await tokenDaCobranca("fake", (await params).id);
  if (!c) notFound();
  return <CartaoFalso token={c.token} total={c.total_centavos} parcelas={c.parcelas} papelaria={c.papelaria} numero={c.numero} />;
}
