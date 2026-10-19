import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { botao, campo, cartao, rotuloCampo } from "@/components/ui";
import { buscarLoja } from "@/lib/cadastro";
import { REGRAS, TITULO_REGRA, type Regra } from "@/lib/desconto";
import { paraCampo } from "@/lib/dinheiro";
import { FAIXAS, ROTULO_FAIXA } from "@/lib/faixa";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { formatarTelefone } from "@/lib/whatsapp";
import { salvarLojaAcao } from "../cadastro-acoes";

export const metadata: Metadata = { title: "Loja" };

// O campo do protótipo ocupa a largura toda; aqui ele precisa caber ao lado do rótulo.
const campoCurto = campo.replace("w-full ", "");

const EXPLICACAO: Record<Regra, string> = {
  lista_completa: "O cliente leva todos os itens da lista, nas quantidades da escola. Trocar a faixa ou incluir itens não tira o desconto.",
  pix: "O cliente paga no Pix.",
  valor_minimo: "Os produtos do pedido somam a partir do valor que você define.",
  faixa: "Todos os itens do pedido escolhidos na mesma faixa, a que você define.",
};

export default async function Loja() {
  const u = await exigirUsuario();
  const papelaria = (await papelariaAtual(u.id))!;
  const loja = (await buscarLoja(u.id, papelaria.id))!;
  const host = (await headers()).get("host") ?? "";
  const marcar = "flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold";

  return (
    <>
      <h1 className="titulo text-2xl font-bold lg:text-[30px]">Loja</h1>
      <p className="mt-1 text-[15px] text-apagado">
        Link dos clientes:{" "}
        <Link href={`/${loja.slug}`} target="_blank" className="break-all font-semibold text-azul hover:underline">{host}/{loja.slug}</Link>
      </p>

      <FormAcao acao={salvarLojaAcao} className="mt-5 flex max-w-[720px] flex-col gap-3">
        <section className={`${cartao} flex flex-col gap-3 p-4 lg:p-[22px]`}>
          <h2 className="text-base font-bold">Papelaria</h2>
          <label className={rotuloCampo}>Nome<input name="nome" required defaultValue={loja.nome} className={campo} /></label>
          <label className={rotuloCampo}>
            WhatsApp de atendimento
            <input name="whatsapp" inputMode="tel" defaultValue={loja.whatsapp ? formatarTelefone(loja.whatsapp) : ""} className={campo} placeholder="(00) 00000-0000" />
            <span className="text-[13px] font-normal text-apagado">Aparece para os clientes como “Atendimento no WhatsApp”.</span>
          </label>
        </section>

        <section className={`${cartao} flex flex-col gap-3 p-4 lg:p-[22px]`}>
          <h2 className="text-base font-bold">Entrega e retirada</h2>
          <label className={marcar}><input type="checkbox" name="aceita_entrega" defaultChecked={loja.aceita_entrega} className="size-[18px] accent-azul" />Entrego em casa</label>
          <label className={`${rotuloCampo} max-w-[220px]`}>
            Taxa de entrega (R$)
            <input name="taxa" inputMode="decimal" defaultValue={paraCampo(loja.taxa_entrega_centavos)} className={campo} />
          </label>
          <label className={marcar}><input type="checkbox" name="aceita_retirada" defaultChecked={loja.aceita_retirada} className="size-[18px] accent-azul" />Os clientes podem retirar na loja</label>
          <label className={rotuloCampo}>
            Endereço para retirada
            <input name="endereco_retirada" defaultValue={loja.endereco_retirada ?? ""} className={campo} placeholder="Rua, número e bairro" />
          </label>
        </section>

        <section className={`${cartao} flex flex-col gap-3 p-4 lg:p-[22px]`}>
          <h2 className="text-base font-bold">Cartão de crédito</h2>
          <label className={`${rotuloCampo} max-w-[220px]`}>
            Parcelar em até
            <select name="parcelas" defaultValue={loja.parcelas_maximas} className={campo}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "à vista" : `${n}x sem juros`}</option>)}
            </select>
          </label>
        </section>

        <section className={`${cartao} flex flex-col gap-1 p-4 lg:p-[22px]`} aria-labelledby="descontos">
          <h2 id="descontos" className="text-base font-bold">Descontos</h2>
          <p className="text-[13px] text-apagado">
            Ligue as regras que fazem sentido para a sua loja e escolha a porcentagem de cada uma. Quando o pedido cumpre mais de
            uma, os descontos se somam, até 50%, e valem sobre os produtos (a taxa de entrega não entra). Os clientes veem as regras
            na lista e o desconto no resumo antes de pagar.
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-linha-2">
            {REGRAS.map((r) => {
              const atual = loja.descontos?.[r];
              return (
                <li key={r} className="flex flex-col gap-2.5 py-3.5">
                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                    <input type="checkbox" name={`desc_${r}`} defaultChecked={atual?.ativo ?? false} className="peer sr-only" />
                    <span aria-hidden="true"
                      className="mt-0.5 flex h-6 w-11 flex-none items-center rounded-full bg-campo p-0.5 transition-colors peer-checked:bg-ok peer-checked:[&>span]:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-azul">
                      <span className="size-5 rounded-full bg-white shadow transition-transform" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-[15px] font-semibold">{TITULO_REGRA[r]}</span>
                      <span className="text-[13px] text-apagado">{EXPLICACAO[r]}</span>
                    </span>
                  </label>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-14">
                    <label className="flex items-center gap-1.5 text-[13px] font-semibold">
                      Desconto
                      <input name={`desc_${r}_pct`} inputMode="numeric" placeholder="0" maxLength={3}
                        defaultValue={atual?.percentual ?? ""} className={`${campoCurto} w-[64px] text-right`} />
                      %
                    </label>
                    {r === "valor_minimo" && (
                      <label className="flex items-center gap-1.5 text-[13px] font-semibold">
                        em compras a partir de R$
                        <input name="desc_valor_minimo_min" inputMode="decimal" placeholder="300,00"
                          defaultValue={loja.descontos?.valor_minimo ? paraCampo(loja.descontos.valor_minimo.minimo_centavos) : ""}
                          className={`${campoCurto} w-[104px]`} />
                      </label>
                    )}
                    {r === "faixa" && (
                      <label className="flex items-center gap-1.5 text-[13px] font-semibold">
                        na faixa
                        <select name="desc_faixa_faixa" defaultValue={loja.descontos?.faixa?.faixa ?? "premium"} className={`${campoCurto} w-[150px]`}>
                          {FAIXAS.map((f) => <option key={f} value={f}>{ROTULO_FAIXA[f]}</option>)}
                        </select>
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <button type="submit" className={`${botao} self-start`}>Salvar</button>
      </FormAcao>
    </>
  );
}
