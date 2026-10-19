import type { Metadata } from "next";
import Link from "next/link";
import { Icone } from "@/components/icone";
import { exigirUsuario } from "@/lib/sessao";
import { FormularioDeProduto } from "../formulario";

export const metadata: Metadata = { title: "Novo produto" };

export default async function NovoProduto() {
  await exigirUsuario();
  return (
    <>
      <Link href="/painel/catalogo" className="inline-flex min-h-11 items-center gap-1 font-semibold text-azul"><Icone nome="voltar" />Catálogo</Link>
      <h1 className="titulo mb-4 text-2xl font-bold lg:text-[30px]">Novo produto</h1>
      <FormularioDeProduto produto={null} />
    </>
  );
}
