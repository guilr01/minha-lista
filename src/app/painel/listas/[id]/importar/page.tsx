import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icone";
import { TIPOS_ACEITOS } from "@/lib/arquivo-de-lista";
import { buscarListaDoEditor, listarProdutos } from "@/lib/cadastro";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar lista da escola" };

export default async function ImportarListaDaEscola({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigirUsuario();
  const papelaria = (await papelariaAtual(u.id))!;
  const [lista, produtos] = await Promise.all([buscarListaDoEditor(u.id, id), listarProdutos(u.id, papelaria.id)]);
  if (!lista) notFound();
  const catalogo = produtos.filter((p) => p.ativo).map((p) => ({
    id: p.id, nome: p.nome, opcoes: p.opcoes.map((o) => ({ faixa: o.faixa, marca: o.marca, preco_centavos: o.preco_centavos })),
  }));

  return (
    <>
      <Link href={`/painel/listas/${id}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-azul">
        <Icone nome="voltar" />{lista.serie.nome} · {lista.escola.nome}
      </Link>
      <h1 className="titulo text-2xl font-bold lg:text-[30px]">Importar a lista da escola</h1>
      <p className="mt-1.5 max-w-[720px] text-[15px] text-apagado">
        Suba o arquivo que a escola mandou ou cole o texto. O sistema compara cada item com o seu catálogo e sugere o produto; você
        confere linha a linha antes de gravar. O que você não vende fica descrito como indisponível no recado da lista, para o cliente
        saber que precisa comprar em outro lugar.
      </p>
      <Importador listaId={id} catalogo={catalogo} tipos={TIPOS_ACEITOS} jaNaLista={lista.itens.map((i) => i.produto_id)} />
    </>
  );
}
