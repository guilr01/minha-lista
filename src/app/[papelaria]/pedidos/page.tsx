import type { Metadata } from "next";
import { MeusPedidos } from "./meus-pedidos";

export const metadata: Metadata = { title: "Meus pedidos" };

export default async function PaginaMeusPedidos({ params }: { params: Promise<{ papelaria: string }> }) {
  const { papelaria } = await params;
  return <MeusPedidos slug={papelaria} />;
}
