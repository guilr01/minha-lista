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
  itensParaPedido,
  linhasDaLista,
  linhasNoPedido,
  linhasValidas,
  opcaoDaLinha,
  produtosConhecidos,
  subtotal,
  totalNaFaixa,
  type Linha,
} from "@/lib/carrinho";
import { reais } from "@/lib/dinheiro";
import { DESCRICAO_FAIXA, FAIXAS, ROTULO_FAIXA, type Faixa } from "@/lib/faixa";
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
  const etapa = Math.min(4, Math.max(1, Number(busca.get("etapa")) || 1));
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
  const total = sub + taxa;
  const faixaAtual = faixaDoCarrinho(m.linhas, produtos);
  const indisponiveis = m.linhas.filter((l) => !l.removida && !opcaoDaLinha(l, produtos));
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
    titulo = `Lista do ${nomeDaLista}`;
    subtitulo = `${itens.length} ${itens.length === 1 ? "item pedido" : "itens pedidos"} pela escola para ${lista.ano_letivo}. Confira antes de ver os preços.`;
    valorTotal = null;
    corpo = (
      <div className="flex flex-col gap-3.5">
        {lista.observacoes && <Informacao>{lista.observacoes}</Informacao>}
        <ul className={`${cartao} px-4 py-0.5`}>
          {itens.map((i) => {
            const ok = i.opcoes.length > 0;
            return (
              <li key={i.produto_id} className="flex items-start gap-3 border-b border-linha-2 py-3 last:border-b-0">
                <span className={`mt-px flex size-6 flex-none items-center justify-center rounded-full ${ok ? "bg-ok-fundo text-ok" : "bg-aviso-fundo text-aviso"}`}>
                  {ok ? <Icone nome="check" tamanho={14} traco={3} /> : <span className="text-sm font-extrabold">!</span>}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <strong className="text-[15px] font-semibold">{i.nome}</strong>
                  {i.observacao && <span className="text-[13px] text-apagado">{i.observacao}</span>}
                  {!ok && <span className="text-[13px] font-semibold text-aviso">Indisponível no momento</span>}
                </div>
                <span className="whitespace-nowrap text-sm font-bold text-apagado">{i.quantidade} {i.unidade}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
    acao = { rotulo: "Ver opções de preço", fazer: () => irPara(2) };
  } else if (etapa === 2) {
    const comPreco = m.linhas.filter((l) => !l.removida && opcaoDaLinha(l, produtos)).length;
    const primeira = m.linhas.find((l) => !l.removida && opcaoDaLinha(l, produtos));
    titulo = "Escolha a faixa da sua lista";
    subtitulo = `${comPreco} itens com preço. Na próxima tela você pode trocar a faixa de um item específico.`;
    rotuloTotal = ROTULO_FAIXA[m.faixaBase];
    valorTotal = totalNaFaixa(m.linhas, produtos, m.faixaBase);
    corpo = (
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-3 lg:gap-3.5" role="radiogroup" aria-label="Faixa de preço">
          {FAIXAS.map((f) => {
            const on = m.faixaBase === f;
            const semAFaixa = m.linhas.filter((l) => {
              const o = !l.removida && opcaoDaLinha(l, produtos, f);
              return o && o.faixa !== f;
            }).length;
            const ex = primeira && opcaoDaLinha(primeira, produtos, f);
            return (
              <button key={f} type="button" role="radio" aria-checked={on}
                onClick={() => setM((a) => ({ ...a, faixaBase: f, linhas: a.linhas.map((l) => ({ ...l, faixa: f })) }))}
                className={`flex w-full flex-col gap-2 rounded-cartao bg-white text-left lg:p-5 ${on ? "border-2 border-azul bg-azul-fundo p-[15px] lg:p-[19px]" : "border border-linha p-4 hover:border-[#9fb4cf]"}`}>
                <span className="flex w-full flex-wrap items-center gap-3">
                  <span className={`size-[22px] flex-none rounded-full ${on ? "border-[7px] border-azul" : "border-2 border-[#9aa3ae]"}`} />
                  <ChipFaixa faixa={f} />
                  <span className="titulo ml-auto text-2xl font-bold lg:ml-0 lg:mt-1.5 lg:w-full lg:text-[30px]">
                    {reais(totalNaFaixa(m.linhas, produtos, f))}
                  </span>
                </span>
                <span className="pl-[34px] text-sm text-apagado lg:pl-0">{DESCRICAO_FAIXA[f]}</span>
                {ex && primeira && (
                  <span className="pl-[34px] text-[13px] lg:pl-0">
                    Ex.: {produtos.get(primeira.produto_id)?.nome}, {ex.marca}, por {reais(ex.preco_centavos)}
                  </span>
                )}
                {semAFaixa > 0 && (
                  <span className="pl-[34px] text-[13px] text-aviso lg:pl-0">
                    {semAFaixa} {semAFaixa === 1 ? "item não tem" : "itens não têm"} esta faixa: usamos a mais próxima.
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {indisponiveis.length > 0 && (
          <Aviso>
            {indisponiveis.length} {indisponiveis.length === 1 ? "item está indisponível" : "itens estão indisponíveis"} e não{" "}
            {indisponiveis.length === 1 ? "entra" : "entram"} neste valor.
          </Aviso>
        )}
      </div>
    );
    acao = { rotulo: `Continuar com a ${ROTULO_FAIXA[m.faixaBase]}`, fazer: () => irPara(3) };
  } else if (etapa === 3) {
    const naLista = new Set(m.linhas.map((l) => l.produto_id));
    const paraAdicionar = catalogo.filter((c) => !naLista.has(c.produto_id) && c.opcoes.length > 0);
    titulo = "Revise sua lista";
    subtitulo = "Remova o que já tem em casa, ajuste quantidades ou troque a faixa de um item.";
    rotuloTotal = `${noPedido.length} ${noPedido.length === 1 ? "item" : "itens"} no pedido`;
    corpo = (
      <div className="flex flex-col gap-3">
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
                <span className="text-sm text-apagado line-through">{p.nome}</span>
                <button type="button" className={`${link} min-h-11`} onClick={() => mudarLinha(l.produto_id, (x) => ({ ...x, removida: false }))}>
                  Desfazer
                </button>
              </div>
            );
          }
          const nota = p.quantidade_lista === 0 ? " · fora da lista" : l.quantidade !== p.quantidade_lista ? ` · a lista pede ${p.quantidade_lista}` : "";
          return (
            <div key={l.produto_id}
              className={`${cartao} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 p-3.5 [grid-template-areas:'info_preco''faixa_qtd'] lg:grid-cols-[minmax(0,1fr)_250px_136px_118px] lg:px-[18px] lg:[grid-template-areas:'info_faixa_qtd_preco']`}>
              <div className="flex min-w-0 flex-col gap-0.5 [grid-area:info]">
                <strong className="text-[15px] font-semibold">{p.nome}</strong>
                <span className="text-[13px] text-apagado">{o.marca} · {reais(o.preco_centavos)} cada{nota}</span>
                {o.faixa !== l.faixa && (
                  <span className="text-[13px] text-aviso">Sem a faixa {ROTULO_FAIXA[l.faixa]}: vai a {ROTULO_FAIXA[o.faixa]}.</span>
                )}
              </div>
              <label className="min-w-0 [grid-area:faixa]">
                <span className="sr-only">Faixa de {p.nome}</span>
                <select className={`${campo} h-11 text-sm`} value={o.faixa}
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
                <strong className="whitespace-nowrap text-[15px]">{reais(o.preco_centavos * l.quantidade)}</strong>
                <button type="button" className="min-h-8 text-sm font-semibold text-erro hover:underline"
                  onClick={() => mudarLinha(l.produto_id, (x) => ({ ...x, removida: true }))}>Remover</button>
              </div>
            </div>
          );
        })}
        {paraAdicionar.length > 0 && (
          <div className="mt-1 flex items-center gap-2.5">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Adicionar item</span>
              <select className={`${campo} h-11 text-sm`} value={adicionar} onChange={(e) => setAdicionar(e.target.value)}>
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
    acao = { rotulo: "Ir para entrega e pagamento", fazer: () => irPara(4), desligado: noPedido.length === 0 };
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
        {erros[k] && <span className="text-xs font-semibold text-erro">{erros[k]}</span>}
      </label>
    );
    const opcao = (nome: string, marcado: boolean, aoMarcar: () => void, icone: "caminhao" | "loja" | "pix" | "cartao", t: string, s: string) => (
      <label className={`flex min-h-[60px] cursor-pointer items-center gap-2.5 rounded-xl bg-white ${marcado ? "border-2 border-azul bg-azul-fundo px-[11px] py-[9px]" : "border border-campo px-3 py-2.5"}`}>
        <input type="radio" name={nome} checked={marcado} onChange={aoMarcar} className="size-[18px] flex-none accent-azul" />
        <Icone nome={icone} />
        <span className="flex flex-col text-[15px] font-semibold leading-tight">{t}<span className="text-[13px] font-medium text-apagado">{s}</span></span>
      </label>
    );
    const secao = "flex flex-col gap-3 p-4 lg:p-[22px]";
    corpo = (
      <div className="flex flex-col gap-3">
        <section className={`${cartao} ${secao}`}>
          <h2 className="text-base font-bold">Aluno</h2>
          {campoTexto("aluno", "Nome do aluno (vai na etiqueta)", { obrigatorio: true, dica: "Ex.: Pedro Souza" })}
          <span className="text-[13px] text-apagado">Lista: {nomeDaLista}</span>
        </section>
        <section className={`${cartao} ${secao}`}>
          <h2 className="text-base font-bold">Responsável</h2>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <span className="text-[13px] text-apagado">
              Retirada em {papelaria.endereco_retirada ?? "endereço da loja"}. Avisamos pelo WhatsApp quando estiver pronto.
            </span>
          )}
        </section>
        <section className={`${cartao} ${secao}`}>
          <h2 className="text-base font-bold">Pagamento</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {opcao("metodo", m.metodo === "pix", () => setM((a) => ({ ...a, metodo: "pix" })), "pix", "Pix", "Aprovação na hora")}
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
          <div className="flex justify-between gap-3 text-[15px]"><span className="text-apagado">{noPedido.length} itens · {faixaAtual === "mista" ? "Mista" : faixaAtual ? ROTULO_FAIXA[faixaAtual] : ""}</span><span>{reais(sub)}</span></div>
          <div className="flex justify-between gap-3 text-[15px]"><span className="text-apagado">Entrega</span><span>{taxa ? reais(taxa) : "Grátis"}</span></div>
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
          <span className="text-[13px] font-bold text-apagado">Passo {etapa} de 4</span>
        </div>
        <div className="hidden pt-[22px] lg:block"><Etapas atual={etapa} /></div>

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:pt-6">
          <main>
            <div className="mb-1.5 hidden lg:block"><BotaoVoltar etapa={etapa} base={base} raiz={`/${papelaria.slug}`} /></div>
            <h1 className="titulo text-[26px] font-bold leading-[1.15] lg:text-[34px] lg:leading-[1.1]">{titulo}</h1>
            {subtitulo && <p className="mt-1.5 text-[15px] leading-relaxed text-apagado lg:mt-2 lg:text-base">{subtitulo}</p>}
            {erroGeral && <div className="mt-4" role="alert"><Aviso>{erroGeral}</Aviso></div>}
            <div className="mt-[18px] lg:mt-[22px]">{corpo}</div>
          </main>

          <aside className="sticky top-[92px] hidden lg:block">
            <div className={`${cartao} flex flex-col gap-3 p-5`}>
              <h2 className="text-lg font-bold">Resumo da lista</h2>
              <Linha2 rotulo="Lista">{nomeDaLista}</Linha2>
              {etapa > 1 && <Linha2 rotulo="Itens com preço">{noPedido.length}</Linha2>}
              {etapa > 1 && faixaAtual && <Linha2 rotulo="Faixa">{etapa === 2 ? ROTULO_FAIXA[m.faixaBase] : faixaAtual === "mista" ? "Mista" : ROTULO_FAIXA[faixaAtual]}</Linha2>}
              {etapa === 4 && <Linha2 rotulo="Produtos">{reais(sub)}</Linha2>}
              {etapa === 4 && <Linha2 rotulo="Entrega">{taxa ? reais(taxa) : "Grátis"}</Linha2>}
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

function Linha2({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[15px]">
      <span className="text-apagado">{rotulo}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

function BotaoVoltar({ etapa, base, raiz }: { etapa: number; base: string; raiz: string }) {
  const destino = etapa === 1 ? raiz : etapa === 2 ? base : `${base}?etapa=${etapa - 1}`;
  return (
    <Link href={destino} className="inline-flex min-h-11 items-center gap-1 pr-1 text-[15px] font-semibold text-azul">
      <Icone nome="voltar" />Voltar
    </Link>
  );
}
