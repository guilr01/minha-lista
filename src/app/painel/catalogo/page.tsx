import type { Metadata } from "next";
import Link from "next/link";
import { Icone } from "@/components/icone";
import { ChipFaixa, botaoPequeno, cartao } from "@/components/ui";
import { listarProdutos, type ProdutoDoCadastro } from "@/lib/cadastro";
import { reais } from "@/lib/dinheiro";
import { FAIXAS, type Faixa } from "@/lib/faixa";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { paraBusca } from "@/lib/texto";
import { BuscaDoCatalogo } from "./busca";

export const metadata: Metadata = { title: "Catálogo" };

function Celula({ p, f }: { p: ProdutoDoCadastro; f: Faixa }) {
  const o = p.opcoes.find((x) => x.faixa === f);
  if (!o) return <span className="text-apagado">—</span>;
  return (
    <span className={`flex flex-col ${o.disponivel ? "" : "text-apagado"}`}>
      <strong className={o.disponivel ? "" : "line-through"}>{reais(o.preco_centavos)}</strong>
      <span className="text-[13px] text-apagado">{o.marca}{o.disponivel ? "" : " · sem estoque"}</span>
    </span>
  );
}

export default async function Catalogo({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirUsuario();
  const papelaria = (await papelariaAtual(u.id))!;
  const produtos = await listarProdutos(u.id, papelaria.id);
  const { salvo } = await searchParams;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="titulo text-2xl font-bold lg:text-[30px]">Catálogo e faixas</h1>
          <p className="mt-1 text-[15px] text-apagado">
            Cada item tem até três opções. Mudar um preço vale para os próximos pedidos; os já feitos não mudam.
          </p>
        </div>
        <Link href="/painel/catalogo/novo" className={botaoPequeno}><Icone nome="mais" tamanho={18} />Novo produto</Link>
      </div>
      {salvo && <p role="status" className="mt-3 text-sm font-semibold text-ok">Produto salvo.</p>}

      {produtos.length === 0 ? (
        <div className={`${cartao} mt-5 px-5 py-10 text-center text-apagado`}>
          Nenhum produto ainda. Comece pelo que mais aparece nas listas: cadernos, lápis, borracha.
        </div>
      ) : (
        <BuscaDoCatalogo>
          <div className={`${cartao} hidden overflow-hidden lg:block`}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#fbfaf6] text-left text-xs font-bold uppercase tracking-[0.04em] text-apagado">
                  <th className="border-b border-linha px-4 py-3">Produto</th>
                  {FAIXAS.map((f) => <th key={f} className="w-[170px] border-b border-linha px-4 py-3"><ChipFaixa faixa={f} /></th>)}
                  <th className="w-[100px] border-b border-linha px-4 py-3">Em listas</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((p) => (
                  <tr key={p.id} data-busca={paraBusca(`${p.nome} ${p.categoria ?? ""} ${p.opcoes.map((o) => o.marca).join(" ")}`)}
                    className="border-b border-linha-2 align-top last:border-b-0 hover:bg-azul-fundo">
                    <td className="px-4 py-3">
                      <Link href={`/painel/catalogo/${p.id}`} className="font-semibold text-azul hover:underline">{p.nome}</Link>
                      <span className="block text-[13px] text-apagado">{p.categoria ?? "Sem categoria"}{p.ativo ? "" : " · inativo"}</span>
                    </td>
                    {FAIXAS.map((f) => <td key={f} className="px-4 py-3"><Celula p={p} f={f} /></td>)}
                    <td className="px-4 py-3">{p.em_listas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-3 lg:hidden">
            {produtos.map((p) => (
              <li key={p.id} data-busca={paraBusca(`${p.nome} ${p.categoria ?? ""} ${p.opcoes.map((o) => o.marca).join(" ")}`)}>
                <Link href={`/painel/catalogo/${p.id}`} className={`${cartao} flex flex-col gap-2.5 p-3.5`}>
                  <span>
                    <strong>{p.nome}</strong>
                    <span className="block text-[13px] text-apagado">{p.categoria ?? "Sem categoria"}{p.ativo ? "" : " · inativo"} · em {p.em_listas} {p.em_listas === 1 ? "lista" : "listas"}</span>
                  </span>
                  <span className="grid grid-cols-3 gap-2 text-sm">
                    {FAIXAS.map((f) => (
                      <span key={f} className="flex flex-col gap-1"><ChipFaixa faixa={f} /><Celula p={p} f={f} /></span>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </BuscaDoCatalogo>
      )}
    </>
  );
}
