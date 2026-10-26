"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Icone } from "@/components/icone";
import { Aviso, ChipFaixa, botao, botaoContornoPequeno, campo, cartao, link, rotuloCampo } from "@/components/ui";
import { reais } from "@/lib/dinheiro";
import type { Faixa } from "@/lib/faixa";
import {
  NOTA_MINIMA, atendeExigencia, cobradoPelaExigencia, emDuvida, lerLinhas, sugeridor, vocabularioDoCatalogo,
  type LinhaDaEscola, type MotivoFora, type Sugestao,
} from "@/lib/lista-da-escola";
import { conferirListaDaEscolaAcao, gravarListaDaEscolaAcao, type Decisao } from "./acoes";

type ProdutoDoCatalogo = { id: string; nome: string; opcoes: { faixa: Faixa; marca: string; preco_centavos: number }[] };

/** Os grupos do bloco "fora da lista": livro primeiro, porque é o que a papelaria mais quer conferir. */
const GRUPOS_FORA: [MotivoFora, string, string][] = [
  ["livro", "Livros (não entram na lista de material)", "livros"],
  ["escola", "Comprados na própria escola", "da escola"],
  ["texto", "Títulos, avisos e recados", "avisos e títulos"],
];

const INDISPONIVEL = "__indisponivel";
const IGNORAR = "__ignorar";
const OPCOES = "__opcoes";

/** Uma das opções de "lápis ou lapiseira", com o produto escolhido para ela. */
type Opcao = { texto: string; sugestoes: Sugestao[]; valor: string };

/**
 * Um trecho da lista na conferência. Tem chave própria, e não a posição:
 * dividir e adicionar mudam as posições, e a escolha feita num cartão não
 * pode pular para o vizinho.
 */
type Cartao = {
  chave: number;
  linha: LinhaDaEscola;
  sugestoes: Sugestao[];
  /** Vazio quando o item não tem alternativas; uma por opção quando tem. */
  opcoes: Opcao[];
  /** Produto, INDISPONIVEL, IGNORAR, ou OPCOES (vale o que está em cada opção). */
  valor: string;
  quantidade: number;
  observacao: string;
  naConferencia: boolean;
  editando: boolean;
};

const melhor = (s: Sugestao[]) => (s[0] && s[0].pontos >= NOTA_MINIMA ? s[0].produto_id : INDISPONIVEL);

export function Importador({ listaId, catalogo, tipos, jaNaLista }: {
  listaId: string; catalogo: ProdutoDoCatalogo[]; tipos: string; jaNaLista: string[];
}) {
  const [cartoes, setCartoes] = useState<Cartao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [ocupado, iniciar] = useTransition();
  const proxima = useRef(0);
  const porId = useMemo(() => new Map(catalogo.map((p) => [p.id, p])), [catalogo]);
  const sugerir = useMemo(() => sugeridor(catalogo), [catalogo]);
  const vocabulario = useMemo(() => vocabularioDoCatalogo(catalogo), [catalogo]);
  const naLista = new Set(jaNaLista);

  /** Linhas lidas viram cartões, com a sugestão do catálogo calculada aqui mesmo. */
  function montar(linhas: LinhaDaEscola[], forcarItem = false): Cartao[] {
    return linhas.map((linha) => {
      // A exigência entra na comparação só pelo que ela cobra ("jumbo"), não pelo objeto ("lápis").
      const cobra = cobradoPelaExigencia(linha.exigencia).join(" ");
      const sugestoes = sugerir(`${linha.descricao} ${linha.observacao} ${cobra}`);
      const opcoes = linha.alternativas.map((texto) => {
        const s = sugerir(`${texto} ${cobra}`);
        return { texto, sugestoes: s, valor: melhor(s) };
      });
      const item = forcarItem || linha.item;
      return {
        chave: proxima.current++, linha, sugestoes, opcoes,
        valor: !item ? IGNORAR : opcoes.length ? OPCOES : melhor(sugestoes),
        quantidade: linha.quantidade,
        observacao: [linha.exigencia, linha.observacao].filter(Boolean).join("; ").slice(0, 120),
        naConferencia: item, editando: false,
      };
    });
  }

  if (!cartoes) {
    return (
      <form className={`${cartao} mt-5 flex flex-col gap-4 p-4 lg:p-[22px]`}
        onSubmit={(ev) => {
          ev.preventDefault();
          const f = new FormData(ev.currentTarget);
          setErro(null);
          iniciar(async () => {
            const r = await conferirListaDaEscolaAcao(f);
            if (r.erro || !r.linhas) return setErro(r.erro ?? "Não foi possível ler a lista.");
            setCartoes(montar(r.linhas));
          });
        }}>
        {erro && <div role="alert"><Aviso>{erro}</Aviso></div>}
        <div className="grid gap-4 @min-[40rem]/pagina:grid-cols-2">
          <label className="flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-campo bg-[#fbfaf6] px-4 text-center hover:border-azul">
            <Icone nome="lista" tamanho={26} className="text-azul" />
            <span className="font-semibold">{nomeArquivo || "Escolher o arquivo da escola"}</span>
            <span className="text-[13px] lg:text-sm text-apagado">PDF, Word, Excel, CSV ou texto · até 3 MB</span>
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

  const mudar = (chave: number, m: Partial<Cartao>) => setCartoes((cs) => cs!.map((c) => (c.chave === chave ? { ...c, ...m } : c)));
  const mudarOpcao = (chave: number, i: number, valor: string) =>
    setCartoes((cs) => cs!.map((c) => (c.chave === chave ? { ...c, opcoes: c.opcoes.map((o, j) => (j === i ? { ...o, valor } : o)) } : c)));
  /** Lê de novo o texto editado: um trecho pode virar dois ("estojo; 02 lápis"), e cada um ganha a sua sugestão. */
  const releitura = (chave: number, texto: string) =>
    setCartoes((cs) => cs!.flatMap((c) => {
      if (c.chave !== chave) return [c];
      const lidas = lerLinhas(texto, { vocabulario }).filter((l) => l.descricao.trim());
      return lidas.length ? montar(lidas, true) : [c];
    }));
  const trazer = (chave: number) => setCartoes((cs) => cs!.map((c) =>
    (c.chave === chave ? { ...c, naConferencia: true, valor: c.opcoes.length ? OPCOES : melhor(c.sugestoes) } : c)));
  const adicionarLinha = () => setCartoes((cs) => [...cs!, { ...montar([{
    original: "", quantidade: 1, descricao: "", observacao: "", item: true, exigencia: "", alternativas: [],
  }])[0], editando: true }]);

  /** Os produtos escolhidos num cartão: um, ou um por opção que a papelaria vende. */
  const produtosDe = (c: Cartao) => (c.valor === OPCOES
    ? [...new Set(c.opcoes.map((o) => o.valor).filter((v) => porId.has(v)))]
    : porId.has(c.valor) ? [c.valor] : []);

  const itens = cartoes.filter((c) => c.naConferencia);
  const fora = cartoes.filter((c) => !c.naConferencia);
  const porMotivo = (m: MotivoFora) => fora.filter((c) => (c.linha.motivo ?? "texto") === m);
  const conta = { produto: 0, indisponivel: 0, ignorar: fora.length };
  for (const c of itens) {
    if (c.editando) continue;
    if (c.valor === IGNORAR) conta.ignorar++;
    else if (produtosDe(c).length) conta.produto++;
    else conta.indisponivel++;
  }

  const gravar = () => {
    const decisoes: Decisao[] = [];
    for (const c of itens) {
      if (c.valor === IGNORAR || c.editando) continue;
      const produtos = produtosDe(c);
      if (!produtos.length) decisoes.push({ tipo: "indisponivel", texto: c.linha.descricao });
      else decisoes.push({ tipo: "produto", produto_id: produtos[0], alternativas: produtos.slice(1), quantidade: c.quantidade, observacao: c.observacao });
    }
    setErro(null);
    iniciar(async () => {
      const r = await gravarListaDaEscolaAcao(listaId, decisoes);
      if (r?.erro) setErro(r.erro);
    });
  };

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2.5">
        {([["Encontrados no catálogo", conta.produto, "text-ok"], ["Indisponíveis", conta.indisponivel, "text-erro"], ["Fora da lista", conta.ignorar, "text-apagado"]] as const).map(([t, n, cor]) => (
          <div key={t} className="flex flex-col rounded-botao border border-linha bg-white px-3 py-2.5">
            <span className="text-[13px] lg:text-sm font-bold text-apagado">{t}</span>
            <span className={`titulo text-2xl font-bold ${cor}`}>{n}</span>
          </div>
        ))}
      </div>

      {itens.length === 0 && (
        <Aviso>Nenhum trecho do arquivo pareceu item de material. Confira o bloco abaixo e traga para a lista o que for item.</Aviso>
      )}
      <ol className="flex flex-col gap-2.5">
        {itens.map((c) => (
          <li key={c.chave}>
            <CartaoDoItem c={c} catalogo={catalogo} porId={porId} naLista={naLista} produtos={produtosDe(c)}
              mudar={(m) => mudar(c.chave, m)} mudarOpcao={(i, v) => mudarOpcao(c.chave, i, v)} releitura={(t) => releitura(c.chave, t)} />
          </li>
        ))}
      </ol>
      <button type="button" className={`${botaoContornoPequeno} self-start`} onClick={adicionarLinha}>
        <Icone nome="mais" tamanho={18} />Adicionar linha
      </button>

      {fora.length > 0 && (
        <details className={`${cartao} group p-3.5 lg:p-4`} open={itens.length === 0}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden justify-between gap-3 font-semibold">
            <span>
              {fora.length} {fora.length === 1 ? "trecho do arquivo ficou" : "trechos do arquivo ficaram"} fora da lista
              <span className="block text-[13px] lg:text-sm font-normal text-apagado">
                {GRUPOS_FORA.map(([m, , rotulo]) => [porMotivo(m).length, rotulo] as const).filter(([n]) => n > 0)
                  .map(([n, rotulo]) => `${n} ${rotulo}`).join(" · ")}
              </span>
            </span>
            <span className="flex-none text-[14px] lg:text-[15px] text-azul group-open:hidden">Ver</span>
            <span className="hidden flex-none text-[14px] lg:text-[15px] text-azul group-open:inline">Esconder</span>
          </summary>
          <p className="leitura mt-1 text-[13px] lg:text-sm text-apagado">
            Não vão para a lista nem para o recado do cliente. Se o sistema errou em algum, traga para a conferência.
          </p>
          {GRUPOS_FORA.map(([motivo, titulo]) => {
            const doGrupo = porMotivo(motivo);
            if (!doGrupo.length) return null;
            return (
              <section key={motivo} className="mt-3">
                <h3 className="text-[13px] lg:text-sm font-bold uppercase tracking-[0.04em] text-apagado">{titulo}</h3>
                <ul className="flex flex-col divide-y divide-linha">
                  {doGrupo.map((c) => (
                    <li key={c.chave} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 text-[14px] lg:text-[15px] text-apagado">{c.linha.original}</span>
                      <button type="button" className={`${botaoContornoPequeno} flex-none`} onClick={() => trazer(c.chave)}>É um item</button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </details>
      )}

      {erro && <div role="alert"><Aviso>{erro}</Aviso></div>}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2.5 border-t border-linha bg-fundo px-4 py-3 lg:mx-0 lg:rounded-botao lg:border">
        <button type="button" className={botao} disabled={ocupado} onClick={gravar}>
          {ocupado ? "Gravando…" : `Adicionar ${conta.produto} ${conta.produto === 1 ? "item" : "itens"} à lista`}
        </button>
        <button type="button" className={botaoContornoPequeno} disabled={ocupado} onClick={() => { setCartoes(null); setNomeArquivo(""); }}>
          Começar de novo
        </button>
        {conta.indisponivel > 0 && <span className="text-[13px] lg:text-sm text-apagado">{conta.indisponivel} indisponíveis vão para o recado da lista.</span>}
      </div>
    </div>
  );
}

function CartaoDoItem({ c, catalogo, porId, naLista, produtos, mudar, mudarOpcao, releitura }: {
  c: Cartao; catalogo: ProdutoDoCatalogo[]; porId: Map<string, ProdutoDoCatalogo>; naLista: Set<string>; produtos: string[];
  mudar: (m: Partial<Cartao>) => void; mudarOpcao: (i: number, valor: string) => void; releitura: (texto: string) => void;
}) {
  const [texto, setTexto] = useState(c.linha.original);
  const temOpcoes = c.opcoes.length > 0;

  // Situação do cartão: nota baixa, empate ou exigência não cumprida pedem conferência.
  const naoCumpre = c.linha.exigencia ? produtos.filter((id) => !atendeExigencia(c.linha.exigencia, porId.get(id)!.nome)) : [];
  const duvida = temOpcoes
    ? c.opcoes.some((o) => o.valor !== INDISPONIVEL && o.valor === o.sugestoes[0]?.produto_id && emDuvida(o.sugestoes))
    : c.valor === c.sugestoes[0]?.produto_id ? emDuvida(c.sugestoes) : (c.sugestoes.find((s) => s.produto_id === c.valor)?.pontos ?? 1) < NOTA_MINIMA;
  const status = c.valor === IGNORAR ? ["Ignorada", "bg-linha-2 text-apagado"]
    : !produtos.length ? ["Item indisponível", "bg-[#fdecea] text-erro"]
    : duvida || naoCumpre.length ? ["Confira", "bg-aviso-fundo text-aviso"] : ["Encontrado", "bg-ok-fundo text-ok"];
  const parecido = !temOpcoes ? c.sugestoes.find((s) => s.produto_id === c.valor) : undefined;

  if (c.editando) {
    return (
      <div className={`${cartao} flex flex-col gap-2.5 p-3.5 lg:p-4`}>
        <label className={rotuloCampo}>
          Texto do item, como a escola escreveria
          <textarea className={`${campo} h-auto min-h-[72px] py-2.5`} value={texto} autoFocus onChange={(e) => setTexto(e.target.value)}
            placeholder={"01 estojo\n02 lápis grafite jumbo"} />
        </label>
        <p className="leitura text-[13px] lg:text-sm text-apagado">
          Dois itens juntos? Ponha cada um numa linha. Para o cliente escolher, escreva com &ldquo;ou&rdquo;: &ldquo;lápis ou lapiseira&rdquo;.
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className={botaoContornoPequeno} disabled={!texto.trim()} onClick={() => releitura(texto)}>Ler de novo</button>
          {c.linha.original && (
            <button type="button" className={`${link} min-h-11`} onClick={() => { setTexto(c.linha.original); mudar({ editando: false }); }}>Cancelar</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${cartao} flex flex-col gap-3 p-3.5 lg:p-4 ${c.valor === IGNORAR ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_14rem]">
          <span className="text-[12px] lg:text-[13px] font-bold uppercase tracking-[0.04em] text-apagado">Lista da escola</span>
          <p className="text-[15px] lg:text-base font-semibold">{c.linha.original}</p>
          <button type="button" className={`${link} text-[13px] lg:text-sm`} onClick={() => mudar({ editando: true })}>Editar ou dividir</button>
        </div>
        <div className="flex flex-none items-center gap-2">
          {parecido && <span className="text-[13px] lg:text-sm font-semibold text-apagado">{Math.round(parecido.pontos * 100)}% parecido</span>}
          {temOpcoes && c.valor === OPCOES && <span className="text-[13px] lg:text-sm font-semibold text-apagado">{c.opcoes.length} opções · o cliente escolhe</span>}
          <span className={`inline-flex h-[26px] items-center rounded-full px-2.5 text-xs lg:text-[13px] font-bold ${status[1]}`}>{status[0]}</span>
        </div>
      </div>

      {c.linha.exigencia && (
        <p className="rounded-xl bg-aviso-fundo px-3 py-2 text-[13px] lg:text-sm text-aviso">
          A escola pede: <strong>{c.linha.exigencia}</strong>.
          {naoCumpre.length > 0 && <> {naoCumpre.map((id) => porId.get(id)!.nome).join(", ")} não diz isso no nome: confira se serve.</>}
        </p>
      )}

      {temOpcoes ? (
        <div className="flex flex-col gap-2.5">
          {c.opcoes.map((o, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <SeletorDeProduto rotulo={`Opção ${i + 1}: ${o.texto}`} valor={c.valor === OPCOES ? o.valor : c.valor} sugestoes={o.sugestoes}
                catalogo={catalogo} umaOpcao onChange={(v) => (v === IGNORAR ? mudar({ valor: IGNORAR }) : (mudar({ valor: OPCOES }), mudarOpcao(i, v)))} />
              {c.valor === OPCOES && porId.has(o.valor) && <Faixas produto={porId.get(o.valor)!} />}
            </div>
          ))}
        </div>
      ) : (
        <SeletorDeProduto rotulo="No seu catálogo" valor={c.valor} sugestoes={c.sugestoes} catalogo={catalogo} onChange={(v) => mudar({ valor: v })} />
      )}

      {produtos.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${rotuloCampo} w-[80px]`}>
            Qtd
            <input type="number" min={1} max={99} className={campo} value={c.quantidade}
              onChange={(ev) => mudar({ quantidade: Math.max(1, Math.min(99, Number(ev.target.value) || 1)) })} />
          </label>
          <label className={`${rotuloCampo} min-w-[160px] flex-[2]`}>
            Observação da escola
            <input className={campo} value={c.observacao} maxLength={120} onChange={(ev) => mudar({ observacao: ev.target.value })} placeholder="Ex.: capa dura" />
          </label>
        </div>
      )}
      {!temOpcoes && porId.has(c.valor) && <Faixas produto={porId.get(c.valor)!} />}
      {produtos.some((id) => naLista.has(id)) && (
        <p className="text-[13px] lg:text-sm text-apagado">Já está na lista: a quantidade passa a ser {c.quantidade}.</p>
      )}
      {temOpcoes && produtos.length === 1 && c.valor === OPCOES && (
        <p className="text-[13px] lg:text-sm text-apagado">Só uma das opções está no seu catálogo: o cliente leva essa.</p>
      )}
      {c.valor !== IGNORAR && !produtos.length && (
        <p className="text-[13px] lg:text-sm text-apagado">Vai para o recado da lista: “{c.linha.descricao}”, para o cliente comprar em outro lugar.</p>
      )}
    </div>
  );
}

function SeletorDeProduto({ rotulo, valor, sugestoes, catalogo, umaOpcao, onChange }: {
  rotulo: string; valor: string; sugestoes: Sugestao[]; catalogo: ProdutoDoCatalogo[]; umaOpcao?: boolean; onChange: (v: string) => void;
}) {
  const sugeridos = new Set(sugestoes.map((s) => s.produto_id));
  return (
    <label className={`${rotuloCampo} min-w-0`}>
      {rotulo}
      <select className={campo} value={valor === OPCOES ? INDISPONIVEL : valor} onChange={(ev) => onChange(ev.target.value)}>
        {sugestoes.length > 0 && (
          <optgroup label="Mais parecidos">
            {sugestoes.map((s) => <option key={s.produto_id} value={s.produto_id}>{s.nome}</option>)}
          </optgroup>
        )}
        <optgroup label="Sem produto">
          <option value={INDISPONIVEL}>{umaOpcao ? "Não vendo esta opção" : "Não vendo este item (indisponível)"}</option>
          <option value={IGNORAR}>Ignorar esta linha (não é item)</option>
        </optgroup>
        <optgroup label="Todo o catálogo">
          {catalogo.filter((p) => !sugeridos.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </optgroup>
      </select>
    </label>
  );
}

function Faixas({ produto }: { produto: ProdutoDoCatalogo }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] lg:text-sm">
      {produto.opcoes.length === 0 && <span className="text-aviso">Este produto não tem nenhuma faixa com preço.</span>}
      {produto.opcoes.map((o) => (
        <span key={o.faixa} className="flex items-center gap-1.5"><ChipFaixa faixa={o.faixa} />{o.marca} · {reais(o.preco_centavos)}</span>
      ))}
    </div>
  );
}
