import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icone";
import { cartao, link } from "@/components/ui";
import { buscarPapelaria } from "@/lib/area-publica";
import { linkWhatsApp } from "@/lib/whatsapp";

type Props = { params: Promise<{ papelaria: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await buscarPapelaria((await params).papelaria);
  return { title: v ? `Lista de material · ${v.papelaria.nome}` : "Papelaria não encontrada" };
}

// Escola → série. Cada série é um link: funciona sem JavaScript e é o mesmo
// endereço que a papelaria divulga para a turma.
export default async function EscolhaDaEscola({ params }: Props) {
  const { papelaria: slug } = await params;
  const v = await buscarPapelaria(slug);
  if (!v) notFound();
  const whats = linkWhatsApp(v.papelaria.whatsapp, "Olá! Preciso de ajuda com a lista de material.");

  return (
    <main className="mx-auto w-full max-w-[1200px] px-5 pb-10 pt-5 lg:px-10 lg:pt-12">
      <div className="max-w-[720px]">
        <h1 className="titulo text-[30px] font-bold leading-[1.12] lg:text-[46px] lg:leading-[1.05]">
          A lista de material do seu filho, pronta e entregue em casa.
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-apagado lg:mt-3 lg:text-lg">
          Escolha a escola e a série. Você vê os preços em três faixas, ajusta o que quiser, paga e
          recebe tudo separado.
        </p>
      </div>

      {v.escolas.length === 0 ? (
        <div className={`${cartao} mt-8 p-8 text-center text-apagado`}>
          Nenhuma lista publicada ainda. Volte em breve ou fale com a papelaria.
        </div>
      ) : (
        <div className="mt-6 grid gap-3.5 lg:mt-8 lg:grid-cols-2 lg:gap-5">
          {v.escolas.map((e) => (
            <section key={e.slug} className={`${cartao} flex flex-col gap-3 p-[18px] lg:p-6`} aria-labelledby={`escola-${e.slug}`}>
              <div className="flex items-center gap-3">
                <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-azul-claro text-azul">
                  <Icone nome="escola" tamanho={22} />
                </span>
                <div className="min-w-0">
                  <h2 id={`escola-${e.slug}`} className="text-[17px] font-bold">{e.nome}</h2>
                  {e.cidade && <p className="text-[13px] text-apagado">{e.cidade}</p>}
                </div>
              </div>
              <ul className="flex flex-col gap-2">
                {e.series.map((s) => (
                  <li key={s.slug}>
                    <Link href={`/${slug}/${e.slug}/${s.slug}`}
                      className="flex min-h-[50px] items-center justify-between rounded-xl border border-campo bg-white px-4 text-[15px] font-semibold hover:border-azul hover:bg-azul-fundo">
                      <span>{s.nome}</span>
                      <span className="flex items-center gap-1 text-sm text-azul">
                        Ver a lista <Icone nome="seta" tamanho={18} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {whats && (
        <p className="mt-6 text-center text-sm text-apagado">
          Não achou a sua escola ou prefere falar com alguém?{" "}
          <a href={whats} className={link} target="_blank" rel="noopener noreferrer">Atendimento no WhatsApp</a>
        </p>
      )}
    </main>
  );
}
