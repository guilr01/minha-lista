import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icone";
import { cartao } from "@/components/ui";
import { buscarPapelaria } from "@/lib/area-publica";

type Props = { params: Promise<{ papelaria: string; escola: string }> };

// O link de uma escola só: a papelaria pode divulgar este para o grupo de
// pais de um colégio inteiro.
export default async function SeriesDaEscola({ params }: Props) {
  const { papelaria: slug, escola: escolaSlug } = await params;
  const v = await buscarPapelaria(slug);
  const escola = v?.escolas.find((e) => e.slug === escolaSlug);
  if (!escola) notFound();
  return (
    <main className="mx-auto w-full max-w-[880px] px-5 pb-10 pt-4 lg:px-10 lg:pt-8">
      <Link href={`/${slug}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-azul">
        <Icone nome="voltar" />Escolas
      </Link>
      <h1 className="titulo mt-1 text-[26px] font-bold leading-tight lg:text-[34px]">{escola.nome}</h1>
      <p className="mt-1.5 text-[15px] text-apagado">Escolha a série do aluno.</p>
      <ul className={`${cartao} mt-5 divide-y divide-linha-2`}>
        {escola.series.map((s) => (
          <li key={s.slug}>
            <Link href={`/${slug}/${escola.slug}/${s.slug}`}
              className="flex min-h-14 items-center justify-between px-4 text-base font-semibold hover:bg-azul-fundo">
              {s.nome}
              <Icone nome="seta" className="text-azul" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
