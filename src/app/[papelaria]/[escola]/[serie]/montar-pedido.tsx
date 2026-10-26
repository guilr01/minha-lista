"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { fazerPedido } from "@/app/acoes-pedido";
import { Icone } from "@/components/icone";
import {
  Aviso,
  ChipFaixa,
  Etapas,
  Informacao,
  botao,
  botaoContornoPequeno,
  campo,
  cartao,
  link,
  rotuloCampo,
} from "@/components/ui";
import {
  QUANTIDADE_MAXIMA,
  faixaDoCarrinho,
  itemDoProduto,
  itensParaPedido,
  linhasDaLista,
  linhasNoPedido,
  linhasValidas,
  opcaoDaLinha,
  produtosConhecidos,
  produtosDoItem,
  subtotal,
  totalNaFaixa,
  type Linha,
} from "@/lib/carrinho";
import { reais } from "@/lib/dinheiro";
import { descontoDoPedido, fraseDaRegra, listaCompleta, regrasAtivas, resumoDosDescontos } from "@/lib/desconto";
import { DESCRICAO_FAIXA, FAIXAS, ROTULO_FAIXA, type Faixa } from "@/lib/faixa";
import { blocosDoRecado } from "@/lib/lista-da-escola";
import { guardarPedido } from "@/lib/meus-pedidos";
import type { ProdutoDoCatalogo, VitrineLista } from "@/lib/vitrine";
import { formatarCep, formatarTelefone } from "@/lib/whatsapp";

type Dados = {
  aluno: string;
  responsavel: string;
  whatsapp: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
};

type Montagem = {
  linhas: Linha[];
  faixaBase: Faixa;
  dados: Dados;
  modalidade: "entrega" | "retirada";
  metodo: "pix" | "cartao";
  parcelas: number;
};

const DADOS_VAZIOS: Dados = {
  aluno: "", responsavel: "", whatsapp: "", cep: "", logradouro: "",
  numero: "", complemento: "", bairro: "", cidade: "",
};

const digitos = (v: string) => v.replace(/\D/g, "");

function validar(m: Montagem): Record<string, string> {
  const e: Record<string, string> = {};
  const d = m.dados;
  if (d.aluno.trim().length < 2) e.aluno = "Informe o nome do aluno";
  if (d.responsavel.trim().length < 2) e.responsavel = "Informe seu nome";
  if (![10, 11].includes(digitos(d.whatsapp).length)) e.whatsapp = "WhatsApp com DDD";
  if (m.modalidade === "entrega") {
    if (digitos(d.cep).length !== 8) e.cep = "CEP com 8 dígitos";
    if (d.logradouro.trim().length < 3) e.logradouro = "Informe a rua";
    if (!d.numero.trim()) e.numero = "Informe o número";
  }
  return e;
}

export function MontarPedido({ vitrine, catalogo }: { vitrine: VitrineLista; catalogo: ProdutoDoCatalogo[] }) {
  const router = useRouter();
  const busca = useSearchParams();
  // Três passos: lista e faixa → revisão → entrega e pagamento. Um ?etapa=4
  // de antes da mudança cai no último.
  const etapa = Math.min(3, Math.max(1, Number(busca.get("etapa")) || 1));
  const { papelaria, escola, serie, lista, itens } = vitrine;
  const chave = `lp:montagem:${lista.id}`;
  const base = `/${papelaria.slug}/${escola.slug}/${serie.slug}`;

  const produtos = useMemo(() => produtosConhecidos(itens, catalogo), [itens, catalogo]);
  const inicial = (): Montagem => ({
    linhas: linhasDaLista(itens, "intermediaria"),
    faixaBase: "intermediaria",
    dados: DADOS_VAZIOS,
    modalidade: papelaria.aceita_entrega ? "entrega" : "retirada",
    metodo: "pix",
    parcelas: 1,
  });
  const [m, setM] = useState<Montagem>(inicial);
  const [carregado, setCarregado] = useState(false);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [adicionar, setAdicionar] = useState("");

  // O carrinho sobrevive a fechar o WhatsApp e voltar: fica neste aparelho.
  // Lido depois da hidratação para o HTML do servidor e o do navegador baterem.
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(chave) ?? "null") as Partial<Montagem> | null;
      const linhas = linhasValidas(g?.linhas, produtos);
      if (g && linhas) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restaurar o que estava salvo só pode acontecer no navegador, depois da hidratação
        setM((atual) => ({
          ...atual,
          linhas,
          faixaBase: FAIXAS.includes(g.faixaBase as Faixa) ? (g.faixaBase as Faixa) : atual.faixaBase,
          dados: { ...DADOS_VAZIOS, ...(g.dados ?? {}) },
          modalidade: g.modalidade === "retirada" && papelaria.aceita_retirada ? "retirada"
            : g.modalidade === "entrega" && papelaria.aceita_entrega ? "entrega" : atual.modalidade,
          metodo: g.metodo === "cartao" ? "cartao" : "pix",
          parcelas: Math.min(papelaria.parcelas_maximas, Math.max(1, Number(g.parcelas) || 1)),
        }));
      }
    } catch {
      // armazenamento bloqueado ou corrompido: segue com a lista da escola
    }
    setCarregado(true);
  }, [chave, produtos, papelaria]);

  useEffect(() => {
    if (!carregado) return;
    try {
      localStorage.setItem(chave, JSON.stringify(m));
    } catch {
      // sem armazenamento: o carrinho só não sobrevive a recarregar
    }
  }, [carregado, chave, m]);

  const irPara = (n: number) => router.push(n === 1 ? base : `${base}?etapa=${n}`);
  const mudarLinha = (id: string, f: (l: Linha) => Linha) =>
    setM((a) => ({ ...a, linhas: a.linhas.map((l) => (l.produto_id === id ? f(l) : l)) }));
  /** "lápis ou lapiseira": os produtos que a escola aceita para o item desta linha, quando há escolha. */
  const opcoesDoItem = (id: string) => {
    const item = itemDoProduto(itens, id);
    return item ? produtosDoItem(item).filter((p) => produtos.has(p)) : [];
  };
  const mudarDado = (k: keyof Dados, v: string) => {
    setM((a) => ({ ...a, dados: { ...a.dados, [k]: v } }));
    if (erros[k]) {
      setErros((a) => {
        const resto = { ...a };
        delete resto[k];
        return resto;
      });
    }
  };

  const noPedido = linhasNoPedido(m.linhas, produtos);
  const sub = subtotal(m.linhas, produtos);
  const taxa = m.modalidade === "entrega" ? papelaria.taxa_entrega_centavos : 0;
  // O desconto é calculado aqui e de novo no banco (app.descontos_aplicados);
  // se as duas contas divergirem, criar_pedido recusa com preco_mudou.
  const desc = descontoDoPedido({ regras: papelaria.descontos, itens, linhas: m.linhas, produtos, metodo: m.metodo, subtotal: sub });
  const ativas = regrasAtivas(papelaria.descontos);
  const total = sub - desc.centavos + taxa;
  const faixaAtual = faixaDoCarrinho(m.linhas, produtos);
  const nomeDaLista = `${serie.nome} · ${escola.nome}`;

  function enviar() {
    const e = validar(m);
    setErros(e);
    setErroGeral(null);
    if (Object.keys(e).length) {
      setErroGeral("Preencha os campos destacados.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    iniciar(async () => {
      const d = m.dados;
      const r = await fazerPedido({
        lista_id: lista.id,
        faixa_base: m.faixaBase,
        metodo_pagamento: m.metodo,
        parcelas: m.metodo === "cartao" ? m.parcelas : 1,
        modalidade: m.modalidade,
        aluno_nome: d.aluno.trim(),
        responsavel_nome: d.responsavel.trim(),
        responsavel_whatsapp: digitos(d.whatsapp),
        endereco: m.modalidade === "entrega"
          ? { cep: digitos(d.cep), logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro, cidade: d.cidade }
          : undefined,
        itens: itensParaPedido(m.linhas, produtos),
        total_esperado_centavos: total,
      });
      if (!r.ok) {
        setErroGeral(r.erro);
        // Preço ou estoque mudou: recarrega os dados da página; o carrinho
        // fica, e os totais se refazem com os valores novos.
        if (r.codigo === "preco_mudou" || r.codigo === "item_indisponivel") router.refresh();
        return;
      }
      guardarPedido({ token: r.token, numero: r.numero, papelaria: papelaria.nome, slug: papelaria.slug,
        aluno: d.aluno.trim(), lista: nomeDaLista, total_centavos: r.total_centavos, criado_em: new Date().toISOString() });
      try {
        localStorage.removeItem(chave);
      } catch {}
      router.push(r.urlCartao ?? `/pedido/${r.token}`);
    });
  }

  // ------------------------------------------------------------ as etapas
  let titulo = "";
  let subtitulo: React.ReactNode = null;
  let corpo: React.ReactNode = null;
  let acao: { rotulo: string; fazer: () => void; desligado?: boolean } = { rotulo: "", fazer: () => {} };
  let rotuloTotal = "Total";
  let valorTotal: number | null = sub;

  if (etapa === 1) {
    // Lista e faixa numa tela só, sem nada para editar: escolhe a faixa no
    // alto e confere a lista inteira naquela faixa, com a marca de cada item.
    // Trocar, tirar e incluir é na revisão.
    const visiveis = m.linhas.filter((l) => !l.removida);
    const removidas = m.linhas.length - visiveis.length;
    titulo = `Lista do ${nomeDaLista}`;
    subtitulo = `${itens.length} ${itens.length === 1 ? "item pedido" : "itens pedidos"} pela escola para ${lista.ano_letivo}. Escolha a faixa de preço e confira a lista.`;
    rotuloTotal = ROTULO_FAIXA[m.faixaBase];
    valorTotal = totalNaFaixa(m.linhas, produtos, m.faixaBase);
    corpo = (
      <div className="flex flex-col gap-3.5">
        {ativas.length > 0 && <AvisoDeDescontos frases={ativas.map((r) => fraseDaRegra(r, papelaria.descontos, reais))} />}
        <div className="grid grid-cols-3 gap-2 lg:gap-3.5" role="radiogroup" aria-label="Faixa de preço">
          {FAIXAS.map((f) => {
            const on = m.faixaBase === f;
            return (
              <button key={f} type="button" role="radio" aria-checked={on}
                onClick={() => setM((a) => ({ ...a, faixaBase: f, linhas: a.linhas.map((l) => ({ ...l, faixa: f })) }))}
                className={`flex min-w-0 flex-col items-start gap-1.5 rounded-cartao bg-white text-left lg:gap-2 ${on ? "border-2 border-azul bg-azul-fundo p-[9px] lg:p-[17px]" : "border border-linha p-2.5 hover:border-[#9fb4cf] lg:p-[18px]"}`}>
                <span className="flex items-center gap-2">
                  <span className={`hidden size-[18px] flex-none rounded-full lg:block ${on ? "border-[6px] border-azul" : "border-2 border-[#9aa3ae]"}`} />
                  <ChipFaixa faixa={f} />
                </span>
                <span className="titulo text-[17px] font-bold leading-tight lg:text-[26px]">
                  {reais(totalNaFaixa(m.linhas, produtos, f))}
                </span>
                <span className="hidden text-[13px] lg:text-sm leading-snug text-apagado lg:block">{DESCRICAO_FAIXA[f]}</span>
              </button>
            );
          })}
        </div>

        <ul className={`${cartao} px-4 py-0.5`} aria-label={`Lista na faixa ${ROTULO_FAIXA[m.faixaBase]}`}>
          {visiveis.map((l) => {
            const p = produtos.get(l.produto_id);
            if (!p) return null;
            const o = opcaoDaLinha(l, produtos);
            return (
              <li key={l.produto_id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-b border-linha-2 py-3 last:border-b-0">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <strong className="text-[15px] lg:text-base font-semibold">{p.nome}</strong>
                  {o ? (
                    <span className="text-[13px] lg:text-sm text-apagado">
                      {o.marca}{l.quantidade > 1 ? ` · ${l.quantidade} × ${reais(o.preco_centavos)}` : ""}
                    </span>
                  ) : (
                    <span className="text-[13px] lg:text-sm font-semibold text-aviso">Indisponível no momento: não entra no valor</span>
                  )}
                  {o && o.faixa !== l.faixa && (
                    <span className="text-[13px] lg:text-sm text-aviso">Sem a faixa {ROTULO_FAIXA[l.faixa]}: vai a {ROTULO_FAIXA[o.faixa]}.</span>
                  )}
                  {p.observacao && <span className="text-[13px] lg:text-sm text-apagado">{p.observacao}</span>}
                  {opcoesDoItem(l.produto_id).length > 1 && (
                    <span className="text-[13px] lg:text-sm font-semibold text-azul">
                      A escola aceita também {opcoesDoItem(l.produto_id).filter((x) => x !== l.produto_id).map((x) => produtos.get(x)!.nome).join(" ou ")}: você escolhe na próxima tela.
                    </span>
                  )}
                </div>
                <strong className="whitespace-nowrap text-[15px] lg:text-base">{o ? reais(o.preco_centavos * l.quantidade) : "–"}</strong>
              </li>
            );
          })}
        </ul>
        {removidas > 0 && (
          <p className="text-[13px] lg:text-sm text-apagado">
            {removidas} {removidas === 1 ? "item foi retirado" : "itens foram retirados"} na revisão e não {removidas === 1 ? "aparece" : "aparecem"} aqui.
          </p>
        )}
        <p className="leitura text-[13px] lg:text-sm text-apagado">Na próxima tela você pode retirar o que já tem, mudar quantidades, trocar a faixa de um item ou incluir outro.</p>
        {/* O recado vai no fim: quem chega quer ver a faixa e a lista primeiro; o que a loja não vende é o último aviso. */}
        {lista.observacoes && <RecadoDaLista recado={lista.observacoes} />}
      </div>
    );
    acao = { rotulo: `Continuar com a ${ROTULO_FAIXA[m.faixaBase]}`, fazer: () => irPara(2) };
  } else if (etapa === 2) {
    const naLista = new Set(m.linhas.map((l) => l.produto_id));
    const paraAdicionar = catalogo.filter((c) => !naLista.has(c.produto_id) && c.opcoes.length > 0);
    titulo = "Revise sua lista";
    subtitulo = "Remova o que já tem em casa, ajuste quantidades ou troque a faixa de um item.";
    rotuloTotal = `${noPedido.length} ${noPedido.length === 1 ? "item" : "itens"} no pedido`;
    const pctLista = papelaria.descontos?.lista_completa?.ativo ? papelaria.descontos.lista_completa.percentual : 0;
    const completa = listaCompleta(itens, m.linhas, produtos);
    // A lista é um CONTÊINER: o cartão do item fica numa linha só quando ELA tem 54rem (o nome
    // com ~260 px, mais faixa, quantidade e preço). Pela janela, o nome ficava com a sobra das
    // colunas fixas e, dependendo do catálogo, saía uma palavra por linha.
    corpo = (
      <div className="@container flex flex-col gap-3">
        {pctLista > 0 && (
          completa ? (
            <div className="rounded-xl bg-ok-fundo px-3.5 py-3 text-[13px] lg:text-sm font-semibold leading-snug text-ok">
              Lista completa: você ganha {pctLista}% de desconto. Tirar um item ou diminuir uma quantidade da lista faz perder o desconto.
            </div>
          ) : (
            <Informacao>Leve todos os itens da lista, nas quantidades da escola, e ganhe {pctLista}% de desconto.</Informacao>
          )
        )}
        {m.linhas.map((l) => {
          const p = produtos.get(l.produto_id);
          if (!p) return null;
          const o = opcaoDaLinha(l, produtos);
          if (!o) {
            return l.removida ? null : (
              <Aviso key={l.produto_id}><strong className="text-tinta">{p.nome}</strong> está indisponível no momento e não entra no pedido.</Aviso>
            );
          }
          if (l.removida) {
            return (
              <div key={l.produto_id} className="flex min-h-[50px] items-center justify-between rounded-cartao border border-dashed border-campo px-3.5">
                <span className="text-sm lg:text-[15px] text-apagado line-through">{p.nome}</span>
                <button type="button" className={`${link} min-h-11`} onClick={() => mudarLinha(l.produto_id, (x) => ({ ...x, removida: false }))}>
                  Desfazer
                </button>
              </div>
            );
          }
          const nota = p.quantidade_lista === 0 ? " · fora da lista" : l.quantidade !== p.quantidade_lista ? ` · a lista pede ${p.quantidade_lista}` : "";
          return (
            <div key={l.produto_id}
              className={`${cartao} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 p-3.5 [grid-template-areas:'info_preco''faixa_qtd'] lg:px-[18px] @min-[54rem]:grid-cols-[minmax(0,1fr)_250px_136px_118px] @min-[54rem]:[grid-template-areas:'info_faixa_qtd_preco']`}>
              <div className="flex min-w-0 flex-col gap-0.5 [grid-area:info]">
                <strong className="text-[15px] lg:text-base font-semibold">{p.nome}</strong>
                <span className="text-[13px] lg:text-sm text-apagado">{o.marca} · {reais(o.preco_centavos)} cada{nota}</span>
                {o.faixa !== l.faixa && (
                  <span className="text-[13px] lg:text-sm text-aviso">Sem a faixa {ROTULO_FAIXA[l.faixa]}: vai a {ROTULO_FAIXA[o.faixa]}.</span>
                )}
                {opcoesDoItem(l.produto_id).length > 1 && (
                  // A escola aceita mais de um produto: o cliente escolhe, como escolhe a faixa.
                  <label className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] lg:text-sm font-semibold text-azul">
                    A escola aceita:
                    <select className={`${campo} h-9 w-auto min-w-0 max-w-full text-sm lg:text-[15px]`} value={l.produto_id}
                      onChange={(ev) => mudarLinha(l.produto_id, (x) => ({ ...x, produto_id: ev.target.value }))}>
                      {opcoesDoItem(l.produto_id).map((x) => (
                        <option key={x} value={x} disabled={x !== l.produto_id && m.linhas.some((y) => y.produto_id === x)}>{produtos.get(x)!.nome}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <label className="min-w-0 [grid-area:faixa]">
                <span className="sr-only">Faixa de {p.nome}</span>
                <select className={`${campo} h-11 text-sm lg:text-[15px]`} value={o.faixa}
                  onChange={(ev) => mudarLinha(l.produto_id, (x) => ({ ...x, faixa: ev.target.value as Faixa }))}>
                  {p.opcoes.map((op) => (
                    <option key={op.faixa} value={op.faixa}>{ROTULO_FAIXA[op.faixa]} · {reais(op.preco_centavos)} · {op.marca}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1 [grid-area:qtd]">
                <button type="button" aria-label={`Diminuir quantidade de ${p.nome}`} disabled={l.quantidade <= 1}
                  onClick={() => mudarLinha(l.produto_id, (x) => ({ ...x, quantidade: Math.max(1, x.quantidade - 1) }))}
                  className="flex size-11 items-center justify-center rounded-campo border border-campo bg-white text-xl font-semibold hover:bg-[#f1ede4] disabled:cursor-not-allowed disabled:opacity-40">−</button>
                <span className="min-w-8 text-center text-base font-bold" aria-live="polite">{l.quantidade}</span>
                <button type="button" aria-label={`Aumentar quantidade de ${p.nome}`} disabled={l.quantidade >= QUANTIDADE_MAXIMA}
                  onClick={() => mudarLinha(l.produto_id, (x) => ({ ...x, quantidade: Math.min(QUANTIDADE_MAXIMA, x.quantidade + 1) }))}
                  className="flex size-11 items-center justify-center rounded-campo border border-campo bg-white text-xl font-semibold hover:bg-[#f1ede4] disabled:cursor-not-allowed disabled:opacity-40">+</button>
              </div>
              <div className="flex flex-col items-end [grid-area:preco]">
                <strong className="whitespace-nowrap text-[15px] lg:text-base">{reais(o.preco_centavos * l.quantidade)}</strong>
                <button type="button" className="min-h-8 text-sm lg:text-[15px] font-semibold text-erro hover:underline"
                  onClick={() => mudarLinha(l.produto_id, (x) => ({ ...x, removida: true }))}>Remover</button>
              </div>
            </div>
          );
        })}
        {paraAdicionar.length > 0 && (
          <div className="mt-1 flex items-center gap-2.5">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Adicionar item</span>
              <select className={`${campo} h-11 text-sm lg:text-[15px]`} value={adicionar} onChange={(e) => setAdicionar(e.target.value)}>
                <option value="">Adicionar um item que faltou…</option>
                {paraAdicionar.map((c) => <option key={c.produto_id} value={c.produto_id}>{c.nome}</option>)}
              </select>
            </label>
            <button type="button" className={botaoContornoPequeno} disabled={!adicionar}
              onClick={() => {
                setM((a) => ({ ...a, linhas: [...a.linhas, { produto_id: adicionar, faixa: a.faixaBase, quantidade: 1, removida: false }] }));
                setAdicionar("");
              }}>
              <Icone nome="mais" tamanho={18} />Adicionar
            </button>
          </div>
        )}
      </div>
    );
    acao = { rotulo: "Ir para entrega e pagamento", fazer: () => irPara(3), desligado: noPedido.length === 0 };
  } else {
    titulo = "Entrega e pagamento";
    valorTotal = total;
    const campoTexto = (k: keyof Dados, rotulo: string, o: { obrigatorio?: boolean; dica?: string; modo?: "tel" | "numeric"; auto?: string; mascara?: (v: string) => string } = {}) => (
      <label className={rotuloCampo}>
        <span>{rotulo}{o.obrigatorio && <span className="text-erro" aria-hidden="true"> *</span>}</span>
        <input className={`${campo} ${erros[k] ? "border-erro bg-[#fff7f5]" : ""}`} value={m.dados[k]}
          placeholder={o.dica} inputMode={o.modo} autoComplete={o.auto ?? "off"} aria-required={o.obrigatorio}
          aria-invalid={erros[k] ? true : undefined}
          onChange={(e) => mudarDado(k, o.mascara ? o.mascara(e.target.value) : e.target.value)} />
        {erros[k] && <span className="text-xs lg:text-[13px] font-semibold text-erro">{erros[k]}</span>}
      </label>
    );
    const opcao = (nome: string, marcado: boolean, aoMarcar: () => void, icone: "caminhao" | "loja" | "pix" | "cartao", t: string, s: string) => (
      <label className={`flex min-h-[60px] cursor-pointer items-center gap-2.5 rounded-xl bg-white ${marcado ? "border-2 border-azul bg-azul-fundo px-[11px] py-[9px]" : "border border-campo px-3 py-2.5"}`}>
        <input type="radio" name={nome} checked={marcado} onChange={aoMarcar} className="size-[18px] flex-none accent-azul" />
        <Icone nome={icone} />
        <span className="flex flex-col text-[15px] lg:text-base font-semibold leading-tight">{t}<span className="text-[13px] lg:text-sm font-medium text-apagado">{s}</span></span>
      </label>
    );
    const secao = "flex flex-col gap-3 p-4 lg:p-[22px]";
    corpo = (
      <div className="flex flex-col gap-3">
        <section className={`${cartao} ${secao}`}>
          <h2 className="text-base font-bold">Aluno</h2>
          {campoTexto("aluno", "Nome do aluno (vai na etiqueta)", { obrigatorio: true, dica: "Ex.: Pedro Souza" })}
          <span className="text-[13px] lg:text-sm text-apagado">Lista: {nomeDaLista}</span>
        </section>
        <section className={`${cartao} ${secao} @container`}>
          <h2 className="text-base font-bold">Responsável</h2>
          <div className="grid gap-3 @min-[30rem]:grid-cols-2">
            {campoTexto("responsavel", "Seu nome", { obrigatorio: true, auto: "name" })}
            {campoTexto("whatsapp", "WhatsApp", { obrigatorio: true, dica: "(00) 00000-0000", modo: "tel", auto: "tel", mascara: formatarTelefone })}
          </div>
        </section>
        <section className={`${cartao} ${secao}`}>
          <h2 className="text-base font-bold">Como quer receber?</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {papelaria.aceita_entrega && opcao("modalidade", m.modalidade === "entrega", () => setM((a) => ({ ...a, modalidade: "entrega" })), "caminhao", "Entregar em casa",
              papelaria.taxa_entrega_centavos ? reais(papelaria.taxa_entrega_centavos) : "Grátis")}
            {papelaria.aceita_retirada && opcao("modalidade", m.modalidade === "retirada", () => setM((a) => ({ ...a, modalidade: "retirada" })), "loja", "Retirar na loja", "Grátis")}
          </div>
          {m.modalidade === "entrega" ? (
            <>
              <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3">
                {campoTexto("cep", "CEP", { obrigatorio: true, dica: "00000-000", modo: "numeric", auto: "postal-code", mascara: formatarCep })}
                {campoTexto("logradouro", "Rua", { obrigatorio: true, auto: "address-line1" })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {campoTexto("numero", "Número", { obrigatorio: true, modo: "numeric" })}
                {campoTexto("complemento", "Complemento", { dica: "Opcional", auto: "address-line2" })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {campoTexto("bairro", "Bairro", { auto: "address-level3" })}
                {campoTexto("cidade", "Cidade", { auto: "address-level2" })}
              </div>
            </>
          ) : (
            <span className="text-[13px] lg:text-sm text-apagado">
              Retirada em {papelaria.endereco_retirada ?? "endereço da loja"}. Avisamos pelo WhatsApp quando estiver pronto.
            </span>
          )}
        </section>
        <section className={`${cartao} ${secao}`}>
          <h2 className="text-base font-bold">Pagamento</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {opcao("metodo", m.metodo === "pix", () => setM((a) => ({ ...a, metodo: "pix" })), "pix", "Pix",
              papelaria.descontos?.pix?.ativo ? `${papelaria.descontos.pix.percentual}% de desconto` : "Aprovação na hora")}
            {opcao("metodo", m.metodo === "cartao", () => setM((a) => ({ ...a, metodo: "cartao" })), "cartao", "Cartão de crédito",
              papelaria.parcelas_maximas > 1 ? `Até ${papelaria.parcelas_maximas}x sem juros` : "À vista")}
          </div>
          {m.metodo === "cartao" && papelaria.parcelas_maximas > 1 && (
            <label className={rotuloCampo}>
              Parcelas
              <select className={campo} value={m.parcelas} onChange={(e) => setM((a) => ({ ...a, parcelas: Number(e.target.value) }))}>
                {Array.from({ length: papelaria.parcelas_maximas }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}x de {reais(Math.ceil(total / n))} sem juros</option>
                ))}
              </select>
            </label>
          )}
        </section>
        <section className={`${cartao} ${secao} lg:hidden`}>
          <h2 className="text-base font-bold">Resumo</h2>
          <div className="flex justify-between gap-3 text-[15px] lg:text-base"><span className="text-apagado">{noPedido.length} itens · {faixaAtual === "mista" ? "Mista" : faixaAtual ? ROTULO_FAIXA[faixaAtual] : ""}</span><span>{reais(sub)}</span></div>
          <LinhasDeDesconto desc={desc} />
          <div className="flex justify-between gap-3 text-[15px] lg:text-base"><span className="text-apagado">Entrega</span><span>{taxa ? reais(taxa) : "Grátis"}</span></div>
        </section>
      </div>
    );
    acao = { rotulo: enviando ? "Criando o pedido…" : "Continuar para o pagamento", fazer: enviar, desligado: enviando || noPedido.length === 0 };
  }

  const botaoAcao = (
    <button type="button" className={`${botao} w-full`} onClick={acao.fazer} disabled={acao.desligado}>{acao.rotulo}</button>
  );

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1200px] flex-1 px-5 pb-8 lg:px-10">
        <div className="flex min-h-[60px] items-center justify-between lg:hidden">
          <BotaoVoltar etapa={etapa} base={base} raiz={`/${papelaria.slug}`} />
          <span className="text-[13px] lg:text-sm font-bold text-apagado">Passo {etapa} de 3</span>
        </div>
        <div className="hidden pt-[22px] lg:block"><Etapas atual={etapa} /></div>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:pt-6">
          <main>
            <div className="mb-1.5 hidden lg:block"><BotaoVoltar etapa={etapa} base={base} raiz={`/${papelaria.slug}`} /></div>
            <h1 className="titulo text-[26px] font-bold leading-[1.15] lg:text-[34px] lg:leading-[1.1]">{titulo}</h1>
            {subtitulo && <p className="leitura mt-1.5 text-[15px] leading-relaxed text-apagado lg:mt-2 lg:text-base">{subtitulo}</p>}
            {erroGeral && <div className="mt-4" role="alert"><Aviso>{erroGeral}</Aviso></div>}
            <div className="mt-[18px] lg:mt-[22px]">{corpo}</div>
          </main>

          <aside className="sticky top-[92px] hidden lg:block">
            <div className={`${cartao} flex flex-col gap-3 p-5`}>
              <h2 className="text-lg font-bold">Resumo da lista</h2>
              <Linha2 rotulo="Lista">{nomeDaLista}</Linha2>
              <Linha2 rotulo="Itens com preço">{noPedido.length}</Linha2>
              {faixaAtual && <Linha2 rotulo="Faixa">{etapa === 1 ? ROTULO_FAIXA[m.faixaBase] : faixaAtual === "mista" ? "Mista" : ROTULO_FAIXA[faixaAtual]}</Linha2>}
              {etapa === 3 && <Linha2 rotulo="Produtos">{reais(sub)}</Linha2>}
              {etapa === 3 && <LinhasDeDesconto desc={desc} />}
              {etapa === 3 && <Linha2 rotulo="Entrega">{taxa ? reais(taxa) : "Grátis"}</Linha2>}
              {valorTotal !== null && (
                <div className="flex items-baseline justify-between border-t border-linha-2 pt-3">
                  <span className="font-bold">Total</span>
                  <span className="titulo text-[28px] font-bold">{reais(valorTotal)}</span>
                </div>
              )}
              {botaoAcao}
            </div>
          </aside>
        </div>
      </div>

      <div className="sticky bottom-0 z-[5] flex flex-col gap-2.5 border-t border-linha bg-white px-5 pb-[18px] pt-3.5 lg:hidden">
        {valorTotal !== null && (
          <div className="flex items-baseline justify-between">
            <span className="text-apagado">{rotuloTotal}</span>
            <span className="titulo text-2xl font-bold">{reais(valorTotal)}</span>
          </div>
        )}
        {botaoAcao}
      </div>
    </div>
  );
}

function AvisoDeDescontos({ frases }: { frases: string[] }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#cfe5d6] bg-ok-fundo px-3.5 py-3 text-[13px] lg:text-sm leading-snug text-ok">
      <strong className="text-[14px] lg:text-[15px]">Descontos desta papelaria</strong>
      {frases.map((f) => <span key={f}>• {f}</span>)}
      {frases.length > 1 && <span className="text-tinta/70">Os descontos se somam, até 50%, e valem sobre os produtos.</span>}
    </div>
  );
}

/** Uma linha por regra que o pedido cumpre. Mesma conta do banco (src/lib/desconto.ts). */
function LinhasDeDesconto({ desc }: { desc: ReturnType<typeof descontoDoPedido> }) {
  if (!desc.centavos) return null;
  const soma = desc.aplicadas.reduce((t, a) => t + a.percentual, 0);
  return (
    <div className="flex justify-between gap-3 text-[15px] lg:text-base font-semibold text-ok">
      <span className="flex flex-col">
        Desconto de {desc.percentual}%
        <span className="text-[13px] lg:text-sm font-normal">
          {resumoDosDescontos(desc.aplicadas)}
          {desc.percentual < soma ? " (teto de 50%)" : ""}
        </span>
      </span>
      <span className="whitespace-nowrap">− {reais(desc.centavos)}</span>
    </div>
  );
}

function Linha2({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[15px] lg:text-base">
      <span className="text-apagado">{rotulo}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function BotaoVoltar({ etapa, base, raiz }: { etapa: number; base: string; raiz: string }) {
  const destino = etapa === 1 ? raiz : etapa === 2 ? base : `${base}?etapa=${etapa - 1}`;
  return (
    <Link href={destino} className="inline-flex min-h-11 items-center gap-1 pr-1 text-[15px] lg:text-base font-semibold text-azul">
      <Icone nome="voltar" />Voltar
    </Link>
  );
}

/** O recado da lista, com cada item do "não vendemos" numa linha. */
function RecadoDaLista({ recado }: { recado: string }) {
  return (
    <Informacao>
      <div className="flex flex-col gap-2">
        {blocosDoRecado(recado).map((b, i) =>
          b.tipo === "texto" ? (
            <p key={i}>{b.texto}</p>
          ) : (
            <div key={i}>
              {b.titulo && <p className="font-semibold">{b.titulo}</p>}
              <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5">
                {b.itens.map((item, j) => <li key={j}>{item}</li>)}
              </ul>
            </div>
          ),
        )}
      </div>
    </Informacao>
  );
}
