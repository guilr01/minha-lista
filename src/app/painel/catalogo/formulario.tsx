import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { ChipFaixa, botao, botaoContornoPequeno, campo, cartao, rotuloCampo } from "@/components/ui";
import type { ProdutoDoCadastro } from "@/lib/cadastro";
import { paraCampo } from "@/lib/dinheiro";
import { DESCRICAO_FAIXA, FAIXAS } from "@/lib/faixa";
import { excluirProdutoAcao, salvarProdutoAcao } from "../cadastro-acoes";

// Um produto e as suas até três faixas. Faixa com marca e preço em branco é
// faixa que a papelaria não vende deste item: o pai que escolher ela recebe a
// mais próxima abaixo.
export function FormularioDeProduto({ produto, categorias }: { produto: ProdutoDoCadastro | null; categorias: string[] }) {
  const opcao = (f: (typeof FAIXAS)[number]) => produto?.opcoes.find((o) => o.faixa === f);
  return (
    <>
      <FormAcao acao={salvarProdutoAcao} className="flex flex-col gap-3">
        {produto && <input type="hidden" name="id" value={produto.id} />}
        <section className={`${cartao} flex flex-col gap-3 p-4 lg:p-[22px]`}>
          <h2 className="text-base font-bold">Item</h2>
          <label className={rotuloCampo}>
            Nome
            <input name="nome" required defaultValue={produto?.nome} className={campo} placeholder="Ex.: Caderno brochura 96 folhas" />
          </label>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <label className={rotuloCampo}>
              Categoria
              <input name="categoria" list="categorias" defaultValue={produto?.categoria ?? ""} className={campo} placeholder="Ex.: Cadernos" />
              <datalist id="categorias">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className={rotuloCampo}>
              Unidade
              <input name="unidade" defaultValue={produto?.unidade ?? "un"} className={campo} />
            </label>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold">
            <input type="checkbox" name="ativo" defaultChecked={produto?.ativo ?? true} className="size-[18px] accent-azul" />
            Ativo: aparece nas listas e no catálogo dos pais
          </label>
        </section>

        <div className="grid gap-3 lg:grid-cols-3">
          {FAIXAS.map((f) => {
            const o = opcao(f);
            return (
              <section key={f} className={`${cartao} flex flex-col gap-3 p-4`}>
                <div className="flex items-center justify-between gap-2"><ChipFaixa faixa={f} /></div>
                <p className="-mt-1 text-[13px] text-apagado">{DESCRICAO_FAIXA[f]}</p>
                <label className={rotuloCampo}>
                  Marca
                  <input name={`marca_${f}`} defaultValue={o?.marca ?? ""} className={campo} />
                </label>
                <label className={rotuloCampo}>
                  Preço (R$)
                  <input name={`preco_${f}`} inputMode="decimal" defaultValue={o ? paraCampo(o.preco_centavos) : ""} className={campo} placeholder="0,00" />
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold">
                  <input type="checkbox" name={`disponivel_${f}`} defaultChecked={o?.disponivel ?? true} className="size-[18px] accent-azul" />
                  Tem em estoque
                </label>
              </section>
            );
          })}
        </div>
        <p className="text-[13px] text-apagado">Deixe marca e preço em branco na faixa que você não vende deste item.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={`${botao} min-w-[200px]`}>Salvar produto</button>
          <Link href="/painel/catalogo" className="min-h-11 content-center font-semibold text-azul hover:underline">Voltar ao catálogo</Link>
        </div>
      </FormAcao>

      {produto && (
        <div className="mt-8 border-t border-linha pt-5">
          {produto.em_listas > 0 ? (
            <p className="text-sm text-apagado">
              Este produto está em {produto.em_listas} {produto.em_listas === 1 ? "lista" : "listas"}. Para tirá-lo de venda, desmarque “Ativo”.
            </p>
          ) : (
            <FormAcao acao={excluirProdutoAcao} confirmar={`Excluir “${produto.nome}” do catálogo?`} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={produto.id} />
              <button type="submit" className={`${botaoContornoPequeno} border-erro text-erro hover:bg-[#fff7f5]`}>Excluir produto</button>
              <span className="text-[13px] text-apagado">Pedidos já feitos não mudam.</span>
            </FormAcao>
          )}
        </div>
      )}
    </>
  );
}
