import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Icone } from "@/components/icone";
import { Aviso, ChipFaixa, Informacao, botaoPequeno, cartao } from "@/components/ui";
import { buscarPedido } from "@/lib/area-publica";
import { reais } from "@/lib/dinheiro";
import { ROTULO_FAIXA } from "@/lib/faixa";
import { simulacaoLiberada } from "@/lib/pagamento";
import type { PedidoPublico, StatusPedido } from "@/lib/vitrine";
import { formatarCep, linkWhatsApp } from "@/lib/whatsapp";
import { AtualizarSozinho, CopiarCodigo, GerarDeNovo, SimularPagamento } from "./interativos";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await buscarPedido((await params).token);
  return {
    title: p ? `Pedido #${p.numero}` : "Pedido não encontrado",
    // O endereço é a chave do pedido: nada de indexar.
    robots: { index: false, follow: false },
  };
}

const ROTULO_STATUS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago · a separar",
  em_separacao: "Em separação",
  saiu_para_entrega: "Saiu para entrega",
  pronto_para_retirada: "Pronto para retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
  expirado: "Pagamento expirado",
};

const COR_STATUS: Record<StatusPedido, string> = {
  aguardando_pagamento: "bg-aviso-fundo text-aviso",
  pago: "bg-azul-claro text-azul",
  em_separacao: "bg-aviso-fundo text-aviso",
  saiu_para_entrega: "bg-roxo-fundo text-roxo",
  pronto_para_retirada: "bg-roxo-fundo text-roxo",
  entregue: "bg-ok-fundo text-ok",
  cancelado: "bg-linha-2 text-tinta",
  expirado: "bg-linha-2 text-tinta",
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function LinhaDoTempo({ p }: { p: PedidoPublico }) {
  const ret = p.modalidade === "retirada";
  const quando = (s: StatusPedido) => p.eventos.find((e) => e.status === s)?.em;
  const passos: { titulo: string; status: StatusPedido; dica: string }[] = [
    { titulo: "Pagamento confirmado", status: "pago", dica: "" },
    { titulo: "Em separação", status: "em_separacao", dica: "A papelaria monta o kit" },
    ret
      ? { titulo: "Pronto para retirada", status: "pronto_para_retirada", dica: "Avisamos pelo WhatsApp" }
      : { titulo: "Saiu para entrega", status: "saiu_para_entrega", dica: "Você recebe um aviso" },
    { titulo: ret ? "Retirado" : "Entregue", status: "entregue", dica: ret ? "Na loja" : "No endereço informado" },
  ];
  const ordem = ["pago", "em_separacao", ret ? "pronto_para_retirada" : "saiu_para_entrega", "entregue"];
  const feito = ordem.indexOf(p.status);
  return (
    <ol className={`${cartao} p-[18px]`} aria-label="Andamento do pedido">
      {passos.map((s, i) => {
        const ok = i <= feito;
        const em = quando(s.status);
        return (
          <li key={s.status} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span className={`flex size-[22px] flex-none items-center justify-center rounded-full border-2 text-white ${ok ? "border-ok bg-ok" : "border-campo bg-white"}`}>
                {ok && <Icone nome="check" tamanho={12} traco={3.5} />}
              </span>
              {i < passos.length - 1 && <span className={`min-h-6 w-0.5 flex-1 ${i < feito ? "bg-ok" : "bg-linha"}`} />}
            </div>
            <div className="flex flex-col pb-3.5">
              <strong className={`text-[15px] ${ok ? "" : "font-semibold text-apagado"}`}>{s.titulo}</strong>
              <span className="text-[13px] text-apagado">{em ? hora(em) : s.dica}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

async function BlocoDePagamento({ p, token }: { p: PedidoPublico; token: string }) {
  const simular = simulacaoLiberada();
  const pg = p.pagamento?.status === "pendente" ? p.pagamento : null;

  if (!pg) {
    return (
      <div className={`${cartao} flex flex-col items-center gap-3.5 p-[22px] text-center`}>
        <p>Não conseguimos gerar o pagamento deste pedido.</p>
        <GerarDeNovo token={token} />
      </div>
    );
  }

  if (pg.metodo === "cartao") {
    return (
      <div className={`${cartao} flex flex-col items-center gap-3.5 p-[22px] text-center`}>
        <span className="text-apagado">Valor a pagar</span>
        <span className="titulo text-[32px] font-bold">{reais(p.total_centavos)}</span>
        <span className="text-sm text-apagado">
          {p.parcelas > 1 ? `${p.parcelas}x de ${reais(Math.ceil(p.total_centavos / p.parcelas))} sem juros` : "À vista no cartão"}
        </span>
        {pg.dados.urlCartao && (
          <a href={pg.dados.urlCartao} className={`${botaoPequeno} w-full max-w-[420px]`}>
            <Icone nome="cartao" tamanho={18} />Pagar com cartão
          </a>
        )}
        <span className="text-[13px] text-apagado">Os dados do cartão são digitados na página segura do meio de pagamento.</span>
        <AtualizarSozinho />
      </div>
    );
  }

  const codigo = pg.dados.copiaECola ?? "";
  const qr = await QRCode.toString(codigo, { type: "svg", margin: 1, color: { dark: "#1B2430", light: "#FFFFFF" } });
  return (
    <div className={`${cartao} flex flex-col items-center gap-3.5 p-[22px] text-center`}>
      <span className="text-apagado">Valor a pagar</span>
      <span className="titulo text-[32px] font-bold">{reais(p.total_centavos)}</span>
      <div role="img" aria-label="QR Code do Pix" className="size-[196px] overflow-hidden rounded-xl border border-linha [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: qr }} />
      <CopiarCodigo codigo={codigo} />
      <div className="flex items-center gap-2.5 text-sm text-apagado">
        <span className="size-[18px] animate-spin rounded-full border-[3px] border-azul-claro border-t-azul" />
        Aguardando pagamento…
      </div>
      {p.expira_em && <span className="text-[13px] text-apagado">O código vale até {hora(p.expira_em)}.</span>}
      {simular && (
        <>
          <Informacao>Ambiente de teste: nenhum pagamento real é feito. Use o botão abaixo para simular a confirmação do banco.</Informacao>
          <SimularPagamento token={token} />
        </>
      )}
      <AtualizarSozinho />
    </div>
  );
}

export default async function PaginaDoPedido({ params }: Props) {
  const { token } = await params;
  const p = await buscarPedido(token);
  if (!p) notFound();
  const aguardando = p.status === "aguardando_pagamento";
  const whats = linkWhatsApp(p.papelaria.whatsapp, `Olá! Sobre o pedido #${p.numero} (${p.aluno_nome}).`);
  const e = p.endereco;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-linha bg-white">
        <div className="mx-auto flex min-h-[60px] w-full max-w-[880px] items-center gap-2.5 px-5 lg:px-10">
          <Link href={`/${p.papelaria.slug}`} className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-[34px] flex-none items-center justify-center rounded-campo bg-amarelo font-titulo text-lg font-bold">
              {p.papelaria.nome.charAt(0)}
            </span>
            <span className="titulo truncate text-[19px] font-bold">{p.papelaria.nome}</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-3 px-5 pb-10 pt-5 lg:px-10 lg:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="titulo text-[26px] font-bold lg:text-[34px]">
            {aguardando ? (p.metodo_pagamento === "pix" ? "Pague com Pix" : "Pagamento com cartão") : `Pedido #${p.numero}`}
          </h1>
          <span className={`inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold ${COR_STATUS[p.status]}`}>
            {ROTULO_STATUS[p.status]}
          </span>
        </div>
        <p className="-mt-1 text-[15px] text-apagado">
          {aguardando && `Pedido #${p.numero} · `}{p.aluno_nome} · {p.serie_nome} · {p.escola_nome}
        </p>

        {aguardando && <BlocoDePagamento p={p} token={token} />}
        {p.status === "expirado" && (
          <Aviso>
            O prazo para pagar este pedido acabou e nada foi cobrado.{" "}
            <Link href={`/${p.papelaria.slug}`} className="font-semibold underline">Montar a lista de novo</Link>
          </Aviso>
        )}
        {p.status === "cancelado" && <Aviso>Este pedido foi cancelado pela papelaria.</Aviso>}
        {p.status === "pago" && p.eventos.length <= 2 && (
          <div className="flex flex-col items-center gap-3 py-3 text-center">
            <span className="flex size-[76px] items-center justify-center rounded-full bg-ok-fundo text-ok">
              <Icone nome="check" tamanho={38} traco={2.6} />
            </span>
            <p className="max-w-[440px] leading-snug text-apagado">
              Pagamento recebido. A lista de {p.aluno_nome} já está com a papelaria para separação. Guarde este link para acompanhar.
            </p>
          </div>
        )}
        {!aguardando && p.status !== "expirado" && p.status !== "cancelado" && <LinhaDoTempo p={p} />}

        <section className={cartao} aria-labelledby="itens">
          <h2 id="itens" className="px-4 pt-3.5 text-xs font-bold uppercase tracking-[0.05em] text-apagado">Itens</h2>
          <ul className="px-4 py-1">
            {p.itens.map((i, n) => (
              <li key={n} className="flex justify-between gap-3 border-b border-linha-2 py-2.5 text-sm">
                <span className="flex min-w-0 flex-col gap-1">
                  <span>{i.quantidade}× {i.nome} <span className="text-apagado">· {i.marca}</span></span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <ChipFaixa faixa={i.faixa} />
                    {i.faixa !== i.faixa_pedida && <span className="text-xs text-aviso">pedida: {ROTULO_FAIXA[i.faixa_pedida]}</span>}
                    {i.origem === "adicionado" && <span className="text-xs text-apagado">fora da lista</span>}
                  </span>
                </span>
                <span className="whitespace-nowrap">{reais(i.preco_unitario_centavos * i.quantidade)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-b border-linha-2 py-2.5 text-sm">
              <span className="text-apagado">Entrega</span>
              <span>{p.modalidade === "entrega" ? (p.taxa_entrega_centavos ? reais(p.taxa_entrega_centavos) : "Grátis") : "Retirada · grátis"}</span>
            </li>
            <li className="flex justify-between gap-3 py-2.5">
              <strong>{aguardando || p.status === "expirado" ? "Total" : "Total pago"}</strong>
              <strong>{reais(p.total_centavos)}</strong>
            </li>
          </ul>
        </section>

        <section className={`${cartao} flex flex-col gap-1.5 p-4 text-sm leading-snug`}>
          <h2 className="text-xs font-bold uppercase tracking-[0.05em] text-apagado">{p.modalidade === "entrega" ? "Entrega" : "Retirada"}</h2>
          {e ? (
            <span>
              {e.logradouro}, {e.numero}{e.complemento ? ` · ${e.complemento}` : ""}
              {e.bairro ? ` · ${e.bairro}` : ""}{e.cidade ? ` · ${e.cidade}` : ""} · CEP {formatarCep(e.cep)}
            </span>
          ) : (
            <span>Retirada em {p.papelaria.endereco_retirada ?? "endereço da loja"}</span>
          )}
          <span className="text-apagado">
            Pagamento: {p.metodo_pagamento === "pix" ? "Pix" : `Cartão ${p.parcelas}x`} · Responsável: {p.responsavel_nome}
          </span>
        </section>

        {whats && (
          <p className="mt-2 text-center text-sm text-apagado">
            Dúvidas sobre o pedido?{" "}
            <a href={whats} target="_blank" rel="noopener noreferrer" className="font-semibold text-azul hover:underline">
              Falar com a papelaria no WhatsApp
            </a>
          </p>
        )}
      </main>
    </div>
  );
}
