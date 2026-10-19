import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icone";
import { buscarProduto } from "@/lib/cadastro";
import { exigirUsuario } from "@/lib/sessao";
import { FormularioDeProduto } from "../formulario";

export const metadata: Metadata = { title: "Produto" };

export default async function EditarProduto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigirUsuario();
  const produto = await buscarProduto(u.id, id);
  // Produto de outra papelaria: o RLS não o devolve, e a página responde 404.
  if (!produto) notFound();
  return (
    <>
      <Link href="/painel/catalogo" className="inline-flex min-h-11 items-center gap-1 font-semibold text-azul"><Icone nome="voltar" />Catálogo</Link>
      <h1 className="titulo mb-4 text-2xl font-bold lg:text-[30px]">{produto.nome}</h1>
      <FormularioDeProduto produto={produto} />
    </>
  );
}
