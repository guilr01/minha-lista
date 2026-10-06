import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { Icone } from "@/components/icone";
import { Aviso, ChipFaixa, botaoContornoPequeno, botaoPequeno, campo, cartao, rotuloCampo } from "@/components/ui";
import { buscarListaDoEditor, listarProdutos } from "@/lib/cadastro";
import { linhasDaLista, produtosConhecidos, totalNaFaixa } from "@/lib/carrinho";
import { reais } from "@/lib/dinheiro";
import { FAIXAS } from "@/lib/faixa";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import type { ItemDaLista } from "@/lib/vitrine";
import {
  adicionarItemAcao,
  alterarItemAcao,
  encerrarListaAcao,
  excluirListaAcao,
  publicarListaAcao,
  removerItemAcao,
  salvarObservacoesAcao,
} from "../../cadastro-acoes";

export const metadata: Metadata = { title: "Lista" };

const STATUS = {
  rascunho: { rotulo: "Rascunho", cor: "bg-aviso-fundo text-aviso", dica: "Os pais ainda não veem esta lista." },
  publicada: { rotulo: "Publicada", cor: "bg-ok-fundo text-ok", dica: "Os pais já podem comprar por esta lista." },
  encerrada: { rotulo: "Encerrada", cor: "bg-linha-2 text-apagado", dica: "Fora do ar. Publicar de novo a devolve aos pais." },
} as const;

export default async function EditorDeLista({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const u = await exigirUsuario();
  const papelaria = (await papelariaAtual(u.id))!;
  const [lista, produtos] = await Promise.all([buscarListaDoEditor(u.id, id), listarProdutos(u.id, papelaria.id)]);
  if (!lista) notFound();

  // O que os pais vão ver: a mesma conta da vitrine (src/lib/carrinho.ts),
  // com as opções que estão à venda (ativas e com estoque).
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const comoVitrine: ItemDaLista[] = lista.itens.map((i) => {
    const p = porId.get(i.produto_id);
    return {
      produto_id: i.produto_id, nome: i.nome, categoria: p?.categoria ?? null, unidade: p?.unidade ?? "un",
      quantidade: i.quantidade, observacao: i.observacao,
      opcoes: p && p.ativo ? p.opcoes.filter((o) => o.disponivel).map((o) => ({ id: o.faixa, faixa: o.faixa, marca: o.marca, descricao: null, preco_centavos: o.preco_centavos })) : [],
    };
  });
  const prod = produtosConhecidos(comoVitrine.filter((i) => i.opcoes.length), []);
  const foraDoAr = comoVitrine.filter((i) => i.opcoes.length === 0);
  const naLista = new Set(lista.itens.map((i) => i.produto_id));
  const paraAdicionar = produtos.filter((p) => p.ativo && !naLista.has(p.id) && p.opcoes.length > 0);
  const st = STATUS[lista.status];
  const linkPublico = `/${papelaria.slug}/${lista.escola.slug}/${lista.serie.slug}`;

  return (
    <>
      <Link href="/painel/escolas" className="inline-flex min-h-11 items-center gap-1 font-semibold text-azul"><Icone nome="voltar" />Escolas e listas</Link>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="titulo text-2xl font-bold lg:text-[30px]">{lista.serie.nome} · {lista.escola.nome}</h1>
          <span className="flex flex-wrap items-center gap-2 text-[13px] text-apagado">
            <strong className="text-tinta">Lista de {lista.ano_letivo}</strong>
            <span className={`inline-flex h-[26px] items-center rounded-full px-2.5 text-xs font-bold ${st.cor}`}>{st.rotulo}</span>
            {st.dica}{lista.pedidos > 0 && ` ${lista.pedidos} ${lista.pedidos === 1 ? "pedido" : "pedidos"} feitos por ela.`}
          </span>
        </div>
        <div className="flex flex-wrap items-start gap-2.5">
          {lista.status === "publicada" && (
            <Link href={linkPublico} target="_blank" className={botaoContornoPequeno}>Ver como os pais veem</Link>
          )}
          {lista.status !== "publicada" ? (
            <FormAcao acao={publicarListaAcao} className="flex max-w-[320px] flex-col items-end gap-1">
              <input type="hidden" name="lista" value={lista.id} />
              <button type="submit" className={`${botaoPequeno} bg-ok hover:bg-[#246540]`}>Publicar lista</button>
            </FormAcao>
          ) : (
            <FormAcao acao={encerrarListaAcao} confirmar="Encerrar a lista? Ela sai do ar para os pais." className="flex max-w-[320px] flex-col items-end gap-1">
              <input type="hidden" name="lista" value={lista.id} />
              <button type="submit" className={botaoContornoPequeno}>Encerrar</button>
            </FormAcao>
          )}
        </div>
      </div>

      <section aria-label="Totais da lista" className="mt-5 grid grid-cols-3 gap-2.5 lg:gap-3">
        {FAIXAS.map((f) => (
          <div key={f} className={`${cartao} flex flex-col gap-1.5 p-3 lg:p-4`}>
            <ChipFaixa faixa={f} />
            <span className="titulo text-lg font-bold lg:text-[26px]">{reais(totalNaFaixa(linhasDaLista(comoVitrine, f), prod, f))}</span>
          </div>
        ))}
      </section>
      <p className="mt-2 text-[13px] text-apagado">O total que os pais veem em cada faixa, com os preços de hoje.</p>
      {foraDoAr.length > 0 && (
        <div className="mt-3"><Aviso>
          Os pais não veem {foraDoAr.length === 1 ? "este item, inativo ou sem estoque" : "estes itens, inativos ou sem estoque"}:{" "}
          <strong className="text-tinta">{foraDoAr.map((i) => i.nome).join(", ")}</strong>.
        </Aviso></div>
      )}

      <section className={`${cartao} mt-4 overflow-hidden`} aria-label="Itens da lista">
        <div className="border-b border-linha px-4 py-3.5 lg:px-[22px]">
          <h2 className="font-bold">{lista.itens.length} {lista.itens.length === 1 ? "item" : "itens"}</h2>
        </div>
        <ul>
          {lista.itens.map((i) => (
            <li key={i.id} className="border-b border-linha-2 px-4 py-3 lg:px-[22px]">
              <FormAcao acao={alterarItemAcao} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="item" value={i.id} />
                <span className="min-w-[180px] flex-[2] self-center font-semibold">
                  {i.nome}{!i.ativo && <span className="ml-1.5 text-[13px] font-normal text-aviso">inativo</span>}
                </span>
                <label className={`${rotuloCampo} w-[90px]`}>Qtd<input name="quantidade" type="number" min={1} max={99} required defaultValue={i.quantidade} className={campo} /></label>
                <label className={`${rotuloCampo} min-w-[160px] flex-[2]`}>Observação da escola<input name="observacao" defaultValue={i.observacao ?? ""} className={campo} placeholder="Ex.: capa dura" /></label>
                <button type="submit" className={botaoContornoPequeno}>Salvar</button>
              </FormAcao>
              <FormAcao acao={removerItemAcao} className="mt-1 flex justify-end">
                <input type="hidden" name="item" value={i.id} />
                <button type="submit" className="min-h-9 text-sm font-semibold text-erro hover:underline">Remover da lista</button>
              </FormAcao>
            </li>
          ))}
        </ul>
        <FormAcao acao={adicionarItemAcao} limparAoSalvar className="flex flex-wrap items-end gap-3 bg-[#fbfaf6] px-4 py-4 lg:px-[22px]">
          <input type="hidden" name="lista" value={lista.id} />
          <label className={`${rotuloCampo} min-w-[220px] flex-[2]`}>
            Adicionar produto
            <select name="produto" className={campo} defaultValue="">
              <option value="" disabled>Escolha do catálogo…</option>
              {paraAdicionar.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <label className={`${rotuloCampo} w-[90px]`}>Qtd<input name="quantidade" type="number" min={1} max={99} defaultValue={1} required className={campo} /></label>
          <label className={`${rotuloCampo} min-w-[160px] flex-[2]`}>Observação<input name="observacao" className={campo} /></label>
          <button type="submit" className={botaoPequeno}><Icone nome="mais" tamanho={18} />Adicionar</button>
        </FormAcao>
        {paraAdicionar.length === 0 && (
          <p className="px-4 pb-4 text-[13px] text-apagado lg:px-[22px]">
            Todo o catálogo ativo já está na lista. <Link href="/painel/catalogo/novo" className="font-semibold text-azul hover:underline">Cadastrar produto</Link>
          </p>
        )}
      </section>

      <section className={`${cartao} mt-4 p-4 lg:p-[22px]`}>
        <FormAcao acao={salvarObservacoesAcao} className="flex flex-col gap-3">
          <input type="hidden" name="lista" value={lista.id} />
          <label className={rotuloCampo}>
            Recado para os pais
            <textarea name="observacoes" defaultValue={lista.observacoes ?? ""} rows={3} className={`${campo} h-auto py-2.5`}
              placeholder="Ex.: o avental de pintura é comprado na escola." />
          </label>
          <button type="submit" className={`${botaoContornoPequeno} self-start`}>Salvar recado</button>
        </FormAcao>
      </section>

      {lista.status === "rascunho" && (
        <div className="mt-8 border-t border-linha pt-5">
          <FormAcao acao={excluirListaAcao} confirmar="Excluir este rascunho de lista?" className="flex items-center gap-3">
            <input type="hidden" name="lista" value={lista.id} />
            <button type="submit" className={`${botaoContornoPequeno} border-erro text-erro hover:bg-[#fff7f5]`}>Excluir rascunho</button>
          </FormAcao>
        </div>
      )}
    </>
  );
}
