import type { Metadata } from "next";
import Link from "next/link";
import { ChipFaixa, botaoPequeno, cartao } from "@/components/ui";
import { reais } from "@/lib/dinheiro";
import type { Faixa } from "@/lib/faixa";
import { listarPedidos, type ResumoDoPedido } from "@/lib/painel";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { COR_STATUS, ROTULO_STATUS, haQuanto } from "@/lib/status";
import type { StatusPedido } from "@/lib/vitrine";

export const metadata: Metadata = { title: "Pedidos" };

// O filtro vive na URL (?status=): o recorte ganha endereço e o filtro roda
// no servidor. Cada contador é o próprio filtro.
const FILTROS: { chave: string; rotulo: string; status: StatusPedido[] }[] = [
  { chave: "pago", rotulo: "Pagos, a separar", status: ["pago"] },
  { chave: "em_separacao", rotulo: "Em separação", status: ["em_separacao"] },
  { chave: "despachado", rotulo: "Em entrega ou retirada", status: ["saiu_para_entrega", "pronto_para_retirada"] },
  { chave: "entregue", rotulo: "Entregues", status: ["entregue"] },
];

function faixaDoPedido(faixas: Faixa[]): Faixa | "mista" {
  return faixas.length === 1 ? faixas[0] : "mista";
}

function Status({ s }: { s: StatusPedido }) {
  return <span className={`inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-2.5 text-xs lg:text-[13px] font-bold ${COR_STATUS[s]}`}>{ROTULO_STATUS[s]}</span>;
}

export default async function Pedidos({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const u = await exigirUsuario();
  const papelaria = (await papelariaAtual(u.id))!;
  const todos = await listarPedidos(u.id, papelaria.id);
  const { status } = await searchParams;
  const filtro = FILTROS.find((f) => f.chave === status);
  const lista: ResumoDoPedido[] = filtro ? todos.filter((p) => filtro.status.includes(p.status)) : todos;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="titulo text-2xl font-bold lg:text-[30px]">Pedidos</h1>
        <span className="text-[13px] lg:text-sm text-apagado">{todos.length} {todos.length === 1 ? "pedido pago" : "pedidos pagos"} no total</span>
      </div>

      <nav aria-label="Filtrar pedidos" className="my-[18px] grid grid-cols-2 gap-2.5 lg:grid-cols-5 lg:gap-3">
        {[{ chave: "", rotulo: "Todos", status: [] as StatusPedido[] }, ...FILTROS].map((f) => {
          const n = f.chave ? todos.filter((p) => f.status.includes(p.status)).length : todos.length;
          const ativo = (status ?? "") === f.chave || (!filtro && f.chave === "");
          return (
            <Link key={f.chave || "todos"} href={f.chave ? `/painel?status=${f.chave}` : "/painel"} aria-current={ativo ? "true" : undefined}
              className={`flex flex-col gap-0.5 rounded-botao bg-white text-left hover:border-[#9fb4cf] ${ativo ? "border-2 border-azul px-[15px] py-[13px]" : "border border-linha px-4 py-3.5"}`}>
              <span className="text-[13px] lg:text-sm font-bold text-apagado">{f.rotulo}</span>
              <span className="titulo text-[26px] font-bold">{n}</span>
            </Link>
          );
        })}
      </nav>

      {lista.length === 0 ? (
        <div className={`${cartao} flex flex-col items-center gap-2 px-5 py-10 text-center text-apagado`}>
          {todos.length === 0 ? (
            <>
              <span>Nenhum pedido pago ainda.</span>
              <span className="text-sm lg:text-[15px]">Os pedidos aparecem aqui assim que o pagamento é confirmado.{" "}
                <Link href="/painel/divulgar" className="font-semibold text-azul hover:underline">Divulgue o link e o QR code da sua loja</Link>.
              </span>
            </>
          ) : "Nenhum pedido neste filtro."}
        </div>
      ) : (
        <>
          {/* A tabela só cabe a partir de 1280 px: em notebook de 1024 o status e o botão ficavam
              cortados. Abaixo disso vale a lista em cartões, em duas colunas no computador. */}
          <div className={`${cartao} hidden overflow-hidden xl:block`}>
            <table className="w-full border-collapse text-sm lg:text-[15px]">
              <thead>
                <tr className="bg-[#fbfaf6] text-left text-xs lg:text-[13px] font-bold uppercase tracking-[0.04em] text-apagado">
                  {["Pedido", "Aluno", "Responsável", "Faixa", "Separação", "Total", "Status", ""].map((t, i) => (
                    <th key={i} className="whitespace-nowrap border-b border-linha px-3.5 py-3">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="border-b border-linha-2 last:border-b-0 hover:bg-azul-fundo">
                    <td className="whitespace-nowrap px-3.5 py-3">
                      <span className="font-bold">#{p.numero}</span>
                      <span className="block text-[13px] lg:text-sm text-apagado">{haQuanto(p.pago_em ?? p.criado_em)}</span>
                    </td>
                    <td className="px-3.5 py-3">
                      <span className="font-semibold">{p.aluno_nome}</span>
                      <span className="block text-[13px] lg:text-sm text-apagado">{p.serie_nome} · {p.escola_nome}</span>
                    </td>
                    <td className="px-3.5 py-3">{p.responsavel_nome}</td>
                    <td className="px-3.5 py-3"><ChipFaixa faixa={faixaDoPedido(p.faixas)} /></td>
                    <td className="px-3.5 py-3">{p.separados}/{p.itens}</td>
                    <td className="whitespace-nowrap px-3.5 py-3 font-bold">{reais(p.total_centavos)}</td>
                    <td className="whitespace-nowrap px-3.5 py-3"><Status s={p.status} /></td>
                    <td className="px-3.5 py-3 text-right">
                      <Link href={`/painel/pedidos/${p.numero}`} className={`${botaoPequeno} whitespace-nowrap`}>
                        Abrir pedido
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-3 lg:grid-cols-2 xl:hidden">
            {lista.map((p) => (
              <li key={p.id}>
                <Link href={`/painel/pedidos/${p.numero}`} className={`${cartao} flex h-full flex-col gap-1.5 p-4 hover:border-[#9fb4cf]`}>
                  <span className="flex items-center justify-between gap-3">
                    <strong>#{p.numero} · {p.aluno_nome}</strong>
                    <Status s={p.status} />
                  </span>
                  <span className="text-[13px] lg:text-sm text-apagado">{p.serie_nome} · {p.escola_nome} · {haQuanto(p.pago_em ?? p.criado_em)}</span>
                  <span className="flex items-center justify-between gap-3 text-[13px] lg:text-sm">
                    <span>{p.separados}/{p.itens} separados · {p.modalidade === "entrega" ? "entrega" : "retirada"}</span>
                    <strong className="text-[15px] lg:text-base">{reais(p.total_centavos)}</strong>
                  </span>
                  <span className={`${botaoPequeno} mt-1.5 w-full`}>Abrir pedido</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
