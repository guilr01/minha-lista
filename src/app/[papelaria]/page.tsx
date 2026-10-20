import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cartao, link } from "@/components/ui";
import { buscarPapelaria } from "@/lib/area-publica";
import { linkWhatsApp } from "@/lib/whatsapp";
import { EscolhaDaEscola } from "./escolha";

type Props = { params: Promise<{ papelaria: string }>; searchParams: Promise<{ escola?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await buscarPapelaria((await params).papelaria);
  return { title: v ? `Lista de material · ${v.papelaria.nome}` : "Papelaria não encontrada" };
}

// Escola → série, numa caixa só (escolha.tsx).
export default async function VitrineDaPapelaria({ params, searchParams }: Props) {
  const { papelaria: slug } = await params;
  const { escola } = await searchParams;
  const v = await buscarPapelaria(slug);
  if (!v) notFound();
  const whats = linkWhatsApp(v.papelaria.whatsapp, "Olá! Preciso de ajuda com a lista de material.");

  return (
    <main className="mx-auto w-full max-w-[1200px] px-5 pb-10 pt-5 lg:px-10 lg:pt-12">
      <div className="max-w-[720px]">
        <h1 className="titulo text-[30px] font-bold leading-[1.12] lg:text-[46px] lg:leading-[1.05]">
          A lista de material do aluno, pronta e entregue em casa.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-apagado lg:mt-3 lg:text-lg">
          Escolha a escola e a série. Você vê a lista com os preços em três faixas, ajusta o que
          quiser, paga e recebe tudo separado.
        </p>
      </div>

      <div className="mt-6 max-w-[720px] lg:mt-8">
        {v.escolas.length === 0 ? (
          <div className={`${cartao} p-8 text-center text-apagado`}>
            Nenhuma lista publicada ainda. Volte em breve ou fale com a papelaria.
          </div>
        ) : (
          <EscolhaDaEscola papelaria={slug} escolas={v.escolas} inicial={escola} />
        )}
      </div>

      {whats && (
        <p className="mt-5 max-w-[720px] text-sm lg:text-[15px] text-apagado">
          Não achou a sua escola ou prefere falar com alguém?{" "}
          <a href={whats} className={link} target="_blank" rel="noopener noreferrer">Atendimento no WhatsApp</a>
        </p>
      )}
    </main>
  );
}
