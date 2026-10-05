import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icone";
import { buscarPapelaria } from "@/lib/area-publica";

// A moldura da área do pai. Quem aparece é a PAPELARIA, não a plataforma: o
// pai chegou pelo link dela e está comprando dela.
export default async function MolduraDaPapelaria({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ papelaria: string }>;
}) {
  const { papelaria: slug } = await params;
  const v = await buscarPapelaria(slug);
  if (!v) notFound();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-linha bg-white">
        <div className="mx-auto flex min-h-[60px] w-full max-w-[1200px] items-center justify-between gap-4 px-4 lg:min-h-[68px] lg:px-10">
          <Link href={`/${slug}`} className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-[34px] flex-none items-center justify-center rounded-campo bg-amarelo font-titulo text-lg font-bold text-tinta">
              {v.papelaria.nome.charAt(0)}
            </span>
            <span className="titulo truncate text-[19px] font-bold">{v.papelaria.nome}</span>
          </Link>
          <Link href={`/${slug}/pedidos`}
            className="flex min-h-11 flex-none items-center gap-2 rounded-xl border border-linha bg-white px-3 text-[15px] font-semibold hover:bg-fundo">
            <Icone nome="caixa" tamanho={18} />
            <span>Meus pedidos</span>
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="px-4 py-6 text-center text-xs text-apagado">Pedidos online com Lista Pronta</footer>
    </div>
  );
}
