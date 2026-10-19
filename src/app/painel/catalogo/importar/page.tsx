import type { Metadata } from "next";
import Link from "next/link";
import { Icone } from "@/components/icone";
import { botaoContornoPequeno, cartao } from "@/components/ui";
import { exigirUsuario } from "@/lib/sessao";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar planilha" };

export default async function ImportarPlanilha() {
  await exigirUsuario();
  return (
    <>
      <Link href="/painel/catalogo" className="inline-flex min-h-11 items-center gap-1 font-semibold text-azul"><Icone nome="voltar" />Catálogo</Link>
      <h1 className="titulo text-2xl font-bold lg:text-[30px]">Importar catálogo pelo Excel</h1>
      <p className="mt-1.5 max-w-[680px] text-[15px] text-apagado">
        Cadastre todos os produtos de uma vez: baixe o modelo, preencha uma linha por produto com a marca e o preço
        de cada faixa, e suba o arquivo aqui.
      </p>

      <div className="mt-[18px] grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className={`${cartao} flex flex-col gap-3 p-[18px]`}>
          <h2 className="text-base font-bold">1. Baixe a planilha</h2>
          <a download href="/api/catalogo/planilha" className={botaoContornoPequeno}>
            <Icone nome="lista" tamanho={18} />Modelo em branco
          </a>
          <a download href="/api/catalogo/planilha?catalogo=1" className={botaoContornoPequeno}>
            <Icone nome="etiqueta" tamanho={18} />Meu catálogo atual
          </a>
          <ul className="flex flex-col gap-1.5 text-[13px] leading-snug text-apagado">
            <li>• Uma linha por produto. Não mude os títulos da primeira linha.</li>
            <li>• Preencha marca e preço só das faixas que você vende.</li>
            <li>• Produto com o mesmo nome de um já cadastrado é atualizado; o resto é criado.</li>
            <li>• Faixa em branco não muda o que já existe, e nenhum produto é apagado.</li>
            <li>• Para mudar preços em massa, baixe o catálogo atual, edite e suba de volta.</li>
          </ul>
        </section>

        <Importador />
      </div>
    </>
  );
}
