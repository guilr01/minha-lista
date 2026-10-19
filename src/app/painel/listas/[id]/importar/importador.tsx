"use client";

import { useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { Aviso, ChipFaixa, botao, botaoContornoPequeno, campo, cartao, rotuloCampo } from "@/components/ui";
import { reais } from "@/lib/dinheiro";
import type { Faixa } from "@/lib/faixa";
import { NOTA_MINIMA } from "@/lib/lista-da-escola";
import { conferirListaDaEscolaAcao, gravarListaDaEscolaAcao, type Decisao, type LinhaConferida } from "./acoes";

type ProdutoDoCatalogo = { id: string; nome: string; opcoes: { faixa: Faixa; marca: string; preco_centavos: number }[] };

const INDISPONIVEL = "__indisponivel";
const IGNORAR = "__ignorar";

type Escolha = { valor: string; quantidade: number; observacao: string };

/** O ponto de partida de cada linha: a melhor sugestão, se for boa; título de seção, ignorado; o resto, indisponível. */
function escolhaInicial(l: LinhaConferida): Escolha {
  const melhor = l.sugestoes[0];
  const valor = l.cabecalho ? IGNORAR : melhor && melhor.pontos >= NOTA_MINIMA ? melhor.produto_id : INDISPONIVEL;
  return { valor, quantidade: l.quantidade, observacao: l.observacao };
}

export function Importador({ listaId, catalogo, tipos, jaNaLista }: {
  listaId: string; catalogo: ProdutoDoCatalogo[]; tipos: string; jaNaLista: string[];
}) {
  const [linhas, setLinhas] = useState<LinhaConferida[] | null>(null);
  const [escolhas, setEscolhas] = useState<Escolha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [ocupado, iniciar] = useTransition();
  const porId = new Map(catalogo.map((p) => [p.id, p]));
  const naLista = new Set(jaNaLista);

  if (!linhas) {
    return (
      <form className={`${cartao} mt-5 flex flex-col gap-4 p-4 lg:p-[22px]`}
        onSubmit={(ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          setErro(null);
          iniciar(async () => {
            const r = await conferirListaDaEscolaAcao(f);
            if (r.erro || !r.linhas) return setErro(r.erro ?? "Não foi possível ler a lista.");
            setLinhas(r.linhas);
            setEscolhas(r.linhas.map(escolhaInicial));
          });
        }}>
        {erro && <div role="alert"><Aviso>{erro}</Aviso></div>}
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-campo bg-[#fbfaf6] px-4 text-center hover:border-azul">
            <Icone nome="lista" tamanho={26} className="text-azul" />
            <span className="font-semibold">{nomeArquivo || "Escolher o arquivo da escola"}</span>
            <span className="text-[13px] text-apagado">PDF, Word, Excel, CSV ou texto · até 3 MB</span>
            <input type="file" name="arquivo" accept={tipos} className="sr-only" onChange={(e) => setNomeArquivo(e.target.files?.[0]?.name ?? "")} />
          </label>
          <label className={rotuloCampo}>
            Ou cole o texto da lista (do WhatsApp, do e-mail…)
            <textarea name="texto" rows={6} className={`${campo} h-auto min-h-[150px] py-2.5`}
              placeholder={"02 cadernos brochura 96 folhas\n1 caixa de lápis de cor 24 cores\n3 colas bastão"} />
          </label>
        </div>
        <button type="submit" className={`${botao} self-start`} disabled={ocupado}>
          {ocupado ? "Comparando com o catálogo…" : "Comparar com o catálogo"}
        </button>
      </form>
    );
  }

  const mudar = (i: number, m: Partial<Escolha>) => setEscolhas((a) => a.map((e, j) => (j === i ? { ...e, ...m } : e)));
  const conta = { produto: 0, indisponivel: 0, ignorar: 0 };
  escolhas.forEach((e) => (e.valor === INDISPONIVEL ? conta.indisponivel++ : e.valor === IGNORAR ? conta.ignorar++ : conta.produto++));

  const gravar = () => {
    const decisoes: Decisao[] = [];
    escolhas.forEach((e, i) => {
      if (e.valor === IGNORAR) return;
      if (e.valor === INDISPONIVEL) decisoes.push({ tipo: "indisponivel", texto: linhas[i].descricao });
      else decisoes.push({ tipo: "produto", produto_id: e.valor, quantidade: e.quantidade, observacao: e.observacao });
    });
    setErro(null);
    iniciar(async () => {
      const r = await gravarListaDaEscolaAcao(listaId, decisoes);
      if (r?.erro) setErro(r.erro);
    });
  };

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        {([["Encontrados no catálogo", conta.produto, "text-ok"], ["Indisponíveis", conta.indisponivel, "text-erro"], ["Ignorados", conta.ignorar, "text-apagado"]] as const).map(([t, n, cor]) => (
          <div key={t} className="flex flex-col rounded-botao border border-linha bg-white px-3 py-2.5">
            <span className="text-[13px] font-bold text-apagado">{t}</span>
            <span className={`titulo text-2xl font-bold ${cor}`}>{n}</span>
          </div>
        ))}
      </div>

      <ol className="flex flex-col gap-2.5">
        {linhas.map((l, i) => {
          const e = escolhas[i];
          const produto = porId.get(e.valor);
          const sugestao = l.sugestoes.find((s) => s.produto_id === e.valor);
          const confira = sugestao && sugestao.pontos < 0.6;
          const status = e.valor === IGNORAR ? ["Ignorada", "bg-linha-2 text-apagado"]
            : e.valor === INDISPONIVEL ? ["Item indisponível", "bg-[#fdecea] text-erro"]
            : confira ? ["Confira", "bg-aviso-fundo text-aviso"] : ["Encontrado", "bg-ok-fundo text-ok"];
          const sugeridos = new Set(l.sugestoes.map((s) => s.produto_id));
          return (
            <li key={i} className={`${cartao} flex flex-col gap-3 p-3.5 lg:p-4 ${e.valor === IGNORAR ? "opacity-70" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[12px] font-bold uppercase tracking-[0.04em] text-apagado">Lista da escola</span>
                  <p className="text-[15px] font-semibold">{l.original}</p>
                </div>
                <span className={`inline-flex h-[26px] flex-none items-center rounded-full px-2.5 text-xs font-bold ${status[1]}`}>{status[0]}</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className={`${rotuloCampo} min-w-[240px] flex-[3]`}>
                  No seu catálogo
                  <select className={campo} value={e.valor} onChange={(ev) => mudar(i, { valor: ev.target.value })}>
                    {l.sugestoes.length > 0 && (
                      <optgroup label="Mais parecidos">
                        {l.sugestoes.map((s) => (
                          <option key={s.produto_id} value={s.produto_id}>{s.nome} · {Math.round(s.pontos * 100)}% parecido</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Sem produto">
                      <option value={INDISPONIVEL}>Não vendo este item (indisponível)</option>
                      <option value={IGNORAR}>Ignorar esta linha (não é item)</option>
                    </optgroup>
                    <optgroup label="Todo o catálogo">
                      {catalogo.filter((p) => !sugeridos.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </optgroup>
                  </select>
                </label>
                {produto && (
                  <>
                    <label className={`${rotuloCampo} w-[80px]`}>
                      Qtd
                      <input type="number" min={1} max={99} className={campo} value={e.quantidade}
                        onChange={(ev) => mudar(i, { quantidade: Math.max(1, Math.min(99, Number(ev.target.value) || 1)) })} />
                    </label>
                    <label className={`${rotuloCampo} min-w-[160px] flex-[2]`}>
                      Observação da escola
                      <input className={campo} value={e.observacao} maxLength={120} onChange={(ev) => mudar(i, { observacao: ev.target.value })} placeholder="Ex.: capa dura" />
                    </label>
                  </>
                )}
              </div>
              {produto && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                  {produto.opcoes.length === 0 && <span className="text-aviso">Este produto não tem nenhuma faixa com preço.</span>}
                  {produto.opcoes.map((o) => (
                    <span key={o.faixa} className="flex items-center gap-1.5"><ChipFaixa faixa={o.faixa} />{o.marca} · {reais(o.preco_centavos)}</span>
                  ))}
                  {naLista.has(produto.id) && <span className="text-apagado">Já está na lista: a quantidade passa a ser {e.quantidade}.</span>}
                </div>
              )}
              {e.valor === INDISPONIVEL && (
                <p className="text-[13px] text-apagado">Vai para o recado da lista: “{l.descricao}”, para o cliente comprar em outro lugar.</p>
              )}
            </li>
          );
        })}
      </ol>

      {erro && <div role="alert"><Aviso>{erro}</Aviso></div>}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2.5 border-t border-linha bg-fundo px-4 py-3 lg:mx-0 lg:rounded-botao lg:border">
        <button type="button" className={botao} disabled={ocupado} onClick={gravar}>
          {ocupado ? "Gravando…" : `Adicionar ${conta.produto} ${conta.produto === 1 ? "item" : "itens"} à lista`}
        </button>
        <button type="button" className={botaoContornoPequeno} disabled={ocupado} onClick={() => { setLinhas(null); setNomeArquivo(""); }}>
          Começar de novo
        </button>
        {conta.indisponivel > 0 && <span className="text-[13px] text-apagado">{conta.indisponivel} indisponíveis vão para o recado da lista.</span>}
      </div>
    </div>
  );
}
