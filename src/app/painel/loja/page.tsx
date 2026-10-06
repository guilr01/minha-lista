import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { botao, campo, cartao, rotuloCampo } from "@/components/ui";
import { buscarLoja } from "@/lib/cadastro";
import { paraCampo } from "@/lib/dinheiro";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { formatarTelefone } from "@/lib/whatsapp";
import { salvarLojaAcao } from "../cadastro-acoes";

export const metadata: Metadata = { title: "Loja" };

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
        Link dos pais:{" "}
        <Link href={`/${loja.slug}`} target="_blank" className="break-all font-semibold text-azul hover:underline">{host}/{loja.slug}</Link>
      </p>

      <FormAcao acao={salvarLojaAcao} className="mt-5 flex max-w-[720px] flex-col gap-3">
        <section className={`${cartao} flex flex-col gap-3 p-4 lg:p-[22px]`}>
          <h2 className="text-base font-bold">Papelaria</h2>
          <label className={rotuloCampo}>Nome<input name="nome" required defaultValue={loja.nome} className={campo} /></label>
          <label className={rotuloCampo}>
            WhatsApp de atendimento
            <input name="whatsapp" inputMode="tel" defaultValue={loja.whatsapp ? formatarTelefone(loja.whatsapp) : ""} className={campo} placeholder="(00) 00000-0000" />
            <span className="text-[13px] font-normal text-apagado">Aparece para os pais como “Atendimento no WhatsApp”.</span>
          </label>
        </section>

        <section className={`${cartao} flex flex-col gap-3 p-4 lg:p-[22px]`}>
          <h2 className="text-base font-bold">Entrega e retirada</h2>
          <label className={marcar}><input type="checkbox" name="aceita_entrega" defaultChecked={loja.aceita_entrega} className="size-[18px] accent-azul" />Entrego em casa</label>
          <label className={`${rotuloCampo} max-w-[220px]`}>
            Taxa de entrega (R$)
            <input name="taxa" inputMode="decimal" defaultValue={paraCampo(loja.taxa_entrega_centavos)} className={campo} />
          </label>
          <label className={marcar}><input type="checkbox" name="aceita_retirada" defaultChecked={loja.aceita_retirada} className="size-[18px] accent-azul" />Os pais podem retirar na loja</label>
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

        <button type="submit" className={`${botao} self-start`}>Salvar</button>
      </FormAcao>
    </>
  );
}
