import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { buscarCatalogo, buscarLista } from "@/lib/area-publica";
import { MontarPedido } from "./montar-pedido";

type Props = { params: Promise<{ papelaria: string; escola: string; serie: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const v = await buscarLista(p.papelaria, p.escola, p.serie);
  return { title: v ? `${v.serie.nome} · ${v.escola.nome}` : "Lista não encontrada" };
}

// O link direto da série, o que a papelaria manda no grupo da turma.
export default async function ListaDaSerie({ params }: Props) {
  const p = await params;
  const [vitrine, catalogo] = await Promise.all([
    buscarLista(p.papelaria, p.escola, p.serie),
    buscarCatalogo(p.papelaria),
  ]);
  if (!vitrine) notFound();
  return (
    <Suspense>
      <MontarPedido vitrine={vitrine} catalogo={catalogo} />
    </Suspense>
  );
}
