import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icone } from "@/components/icone";
import { cartao } from "@/components/ui";
import { reais } from "@/lib/dinheiro";
import { ROTULO_FAIXA } from "@/lib/faixa";
import { buscarPedidoDoPainel } from "@/lib/painel";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { COR_STATUS, ROTULO_STATUS, haQuanto, proximoPasso } from "@/lib/status";
import { formatarCep, formatarTelefone, linkWhatsApp } from "@/lib/whatsapp";
import { Avancar, Checklist, Imprimir } from "./interativos";

type Props = { params: Promise<{ numero: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Pedido #${(await params).numero}` };
}

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function PedidoNoPainel({ params }: Props) {
  const numero = Number((await params).numero);
  if (!Number.isInteger(numero)) notFound();
  const u = await exigirUsuario();
  const papelaria = (await papelariaAtual(u.id))!;
  const p = await buscarPedidoDoPainel(u.id, papelaria.id, numero);
  if (!p) notFound();

  const passo = proximoPasso(p.status, p.modalidade);
  const faltam = p.itens.filter((i) => !i.separado).length;
  const bloqueado = p.status === "em_separacao" && faltam > 0;
  const podeMarcar = p.status === "pago" || p.status === "em_separacao";
  const e = p.endereco;
  const enderecoTexto = e
    ? `${e.logradouro}, ${e.numero}${e.complemento ? ` · ${e.complemento}` : ""}${e.bairro ? ` · ${e.bairro}` : ""}${e.cidade ? ` · ${e.cidade}` : ""} · CEP ${formatarCep(e.cep)}`
    : "Retirada na loja";
  const whats = linkWhatsApp(p.responsavel_whatsapp, `Olá, ${p.responsavel_nome}! Aqui é da ${papelaria.nome}, sobre o pedido #${p.numero}.`);

  // O que a papelaria precisa notar antes de separar.
  const atencao = [
    ...p.itens.filter((i) => i.origem === "adicionado").map((i) => `${i.nome_produto}: incluído pelos pais (fora da lista)`),
    ...p.itens.filter((i) => i.origem === "lista" && i.quantidade !== i.quantidade_lista)
      .map((i) => `${i.nome_produto}: a lista pede ${i.quantidade_lista}, os pais pediram ${i.quantidade}`),
    ...p.itens.filter((i) => i.faixa !== i.faixa_pedida)
      .map((i) => `${i.nome_produto}: pedido na ${ROTULO_FAIXA[i.faixa_pedida]}, vai na ${ROTULO_FAIXA[i.faixa]} (faixa indisponível)`),
  ];

  return (
    <>
      <div className="print:hidden">
        <Link href="/painel" className="inline-flex min-h-11 items-center gap-1 font-semibold text-azul"><Icone nome="voltar" />Pedidos</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="titulo text-2xl font-bold lg:text-[30px]">Pedido #{p.numero} · lista de separação</h1>
            <span className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex h-[26px] items-center rounded-full px-2.5 text-xs font-bold ${COR_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
              <span className="text-[13px] text-apagado">pago {haQuanto(p.pago_em ?? p.criado_em)}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Imprimir />
            {passo && <Avancar pedidoId={p.id} para={passo.para} rotulo={passo.rotulo} bloqueado={bloqueado} faltam={faltam} final={passo.para === "entregue"} />}
          </div>
        </div>

        <div className="mt-[18px] grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <Checklist itens={p.itens} habilitado={podeMarcar} />

          <div className="flex flex-col gap-3">
            <section className={`${cartao} flex flex-col gap-1.5 p-4 text-sm leading-snug`}>
              <h2 className="text-xs font-bold uppercase tracking-[0.05em] text-apagado">Aluno e entrega</h2>
              <strong className="text-base">{p.aluno_nome}</strong>
              <span className="text-apagado">{p.serie_nome} · {p.escola_nome} · {p.ano_letivo}</span>
              <span>Responsável: {p.responsavel_nome}</span>
              <span>
                WhatsApp:{" "}
                {whats ? <a href={whats} target="_blank" rel="noopener noreferrer" className="font-semibold text-azul hover:underline">{formatarTelefone(p.responsavel_whatsapp)}</a>
                  : formatarTelefone(p.responsavel_whatsapp)}
              </span>
              <span className="flex items-start gap-1.5">{p.modalidade === "retirada" && <Icone nome="loja" tamanho={16} className="mt-0.5 flex-none" />}{enderecoTexto}</span>
            </section>

            <section className={`${cartao} flex flex-col gap-1.5 p-4 text-sm`}>
              <h2 className="text-xs font-bold uppercase tracking-[0.05em] text-apagado">Pagamento</h2>
              <span className="font-bold text-ok">{p.metodo_pagamento === "pix" ? "Pix" : `Cartão ${p.parcelas}x`} · pago</span>
              <span className="flex justify-between"><span className="text-apagado">Produtos</span><span>{reais(p.subtotal_centavos)}</span></span>
              <span className="flex justify-between"><span className="text-apagado">Entrega</span><span>{p.modalidade === "entrega" ? reais(p.taxa_entrega_centavos) : "Retirada"}</span></span>
              <span className="flex justify-between font-bold"><span>Total</span><span>{reais(p.total_centavos)}</span></span>
            </section>

            {atencao.length > 0 && (
              <section className="flex flex-col gap-1.5 rounded-botao bg-aviso-fundo px-4 py-3.5 text-sm leading-snug text-aviso">
                <h2 className="font-bold text-tinta">Atenção neste pedido</h2>
                {atencao.map((a) => <span key={a}>{a}</span>)}
              </section>
            )}

            <section className={`${cartao} flex flex-col gap-1 p-4 text-sm`}>
              <h2 className="text-xs font-bold uppercase tracking-[0.05em] text-apagado">Histórico</h2>
              {p.eventos.map((ev, i) => (
                <span key={i} className="flex justify-between gap-3">
                  <span>{ROTULO_STATUS[ev.status_para]}</span>
                  <span className="text-apagado">{hora(ev.criado_em)}</span>
                </span>
              ))}
            </section>
          </div>
        </div>
      </div>

      {/* Só no papel: a lista para conferir na prateleira e a etiqueta do kit. */}
      <div className="hidden text-black print:block">
        <p className="text-[20pt] font-bold">Pedido #{p.numero} · {p.aluno_nome}</p>
        <p>{p.serie_nome} · {p.escola_nome} · {p.metodo_pagamento === "pix" ? "Pix" : `Cartão ${p.parcelas}x`}</p>
        <table className="my-3 w-full border-collapse text-[12pt]">
          <thead><tr className="text-left">{["OK", "Produto", "Marca", "Faixa", "Qtd"].map((t) => <th key={t} className="border-b border-[#999] px-1 py-1.5">{t}</th>)}</tr></thead>
          <tbody>
            {p.itens.map((i) => (
              <tr key={i.id}>
                <td className="border-b border-[#999] px-1 py-1.5">☐</td>
                <td className="border-b border-[#999] px-1 py-1.5">{i.nome_produto}</td>
                <td className="border-b border-[#999] px-1 py-1.5">{i.marca}</td>
                <td className="border-b border-[#999] px-1 py-1.5">{ROTULO_FAIXA[i.faixa]}</td>
                <td className="border-b border-[#999] px-1 py-1.5 font-bold">{i.quantidade}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 border-2 border-dashed border-black p-3 text-[13pt] leading-normal">
          <strong>{p.aluno_nome}</strong><br />
          {p.serie_nome} · {p.escola_nome}<br />
          Resp.: {p.responsavel_nome} · {formatarTelefone(p.responsavel_whatsapp)}<br />
          {enderecoTexto}<br />
          {papelaria.nome} · pedido #{p.numero}
        </div>
      </div>
    </>
  );
}
