"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstadoDaAcao } from "@/components/form-acao";
import * as cad from "@/lib/cadastro";
import { centavosDe } from "@/lib/dinheiro";
import { REGRAS, TITULO_REGRA, type RegrasDeDesconto } from "@/lib/desconto";
import { FAIXAS, type Faixa } from "@/lib/faixa";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";

// As ações do cadastro. Cada uma confere a sessão (exigirUsuario) e roda como
// `authenticated`: é o RLS que decide se a linha é desta papelaria.

type Contexto = { usuarioId: string; fornecedorId: string };

async function contexto(): Promise<Contexto> {
  const u = await exigirUsuario();
  const p = await papelariaAtual(u.id);
  if (!p) redirect("/painel");
  return { usuarioId: u.id, fornecedorId: p.id };
}

/** Roda, traduz ErroDeCadastro em mensagem e refaz as telas do painel. */
async function executar(fn: (c: Contexto) => Promise<string | void>): Promise<EstadoDaAcao> {
  const c = await contexto();
  let ok: string | void;
  try {
    ok = await fn(c);
  } catch (e) {
    if (e instanceof cad.ErroDeCadastro) return { erro: e.message };
    console.error("[cadastro]", e);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }
  revalidatePath("/painel", "layout");
  return ok ? { ok } : {};
}

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");
const inteiro = (f: FormData, k: string) => Number.parseInt(texto(f, k), 10);

// --------------------------------------------------------------- catálogo

export async function salvarProdutoAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  const id = texto(f, "id") || null;
  const opcoes: cad.DadosDoProduto["opcoes"] = {};
  for (const faixa of FAIXAS) {
    const marca = texto(f, `marca_${faixa}`).trim();
    const preco = texto(f, `preco_${faixa}`).trim();
    if (!marca && !preco) continue;
    const centavos = centavosDe(preco);
    if (!marca || centavos === null) {
      return { erro: `Na faixa ${faixa === "economica" ? "Econômica" : faixa === "intermediaria" ? "Intermediária" : "Premium"}, preencha a marca e um preço válido, ou deixe as duas em branco.` };
    }
    opcoes[faixa] = { marca, preco_centavos: centavos, disponivel: f.get(`disponivel_${faixa}`) === "on" };
  }
  let novoId: string | null = null;
  const r = await executar(async (c) => {
    novoId = await cad.salvarProduto(c.usuarioId, c.fornecedorId, id, {
      nome: texto(f, "nome"),
      ativo: f.get("ativo") === "on",
      opcoes,
    });
  });
  if (r.erro) return r;
  if (!id && novoId) redirect("/painel/catalogo?salvo=1");
  return { ok: "Produto salvo." };
}

export async function excluirProdutoAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  const r = await executar((c) => cad.excluirProduto(c.usuarioId, texto(f, "id")));
  if (r.erro) return r;
  redirect("/painel/catalogo");
}

// ---------------------------------------------------- escolas e séries

export async function criarEscolaAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar(async (c) => {
    await cad.criarEscola(c.usuarioId, c.fornecedorId, texto(f, "nome"), texto(f, "cidade"));
  });
}

export async function excluirEscolaAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar((c) => cad.excluirEscola(c.usuarioId, texto(f, "id")));
}

export async function criarSerieAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar(async (c) => {
    await cad.criarSerie(c.usuarioId, c.fornecedorId, texto(f, "escola"), texto(f, "nome"));
  });
}

export async function excluirSerieAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar((c) => cad.excluirSerie(c.usuarioId, texto(f, "id")));
}

// ------------------------------------------------------------------ listas

export async function criarListaAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  let id = "";
  const copiarDe = texto(f, "copiar_de");
  const r = await executar(async (c) => {
    id = copiarDe
      ? await cad.copiarLista(c.usuarioId, c.fornecedorId, copiarDe, inteiro(f, "ano"))
      : await cad.criarLista(c.usuarioId, c.fornecedorId, texto(f, "serie"), inteiro(f, "ano"));
  });
  if (r.erro) return r;
  redirect(`/painel/listas/${id}`);
}

export async function adicionarItemAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  if (!texto(f, "produto")) return { erro: "Escolha um produto." };
  return executar((c) =>
    cad.adicionarItem(c.usuarioId, c.fornecedorId, texto(f, "lista"), texto(f, "produto"), inteiro(f, "quantidade"), texto(f, "observacao")),
  );
}

export async function alterarItemAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar(async (c) => {
    await cad.alterarItem(c.usuarioId, texto(f, "item"), inteiro(f, "quantidade"), texto(f, "observacao"));
    return "Salvo.";
  });
}

export async function removerItemAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar((c) => cad.removerItem(c.usuarioId, texto(f, "item")));
}

export async function salvarObservacoesAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar(async (c) => {
    await cad.salvarObservacoes(c.usuarioId, texto(f, "lista"), texto(f, "observacoes"));
    return "Observações salvas.";
  });
}

export async function publicarListaAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar(async (c) => {
    const r = await cad.publicarLista(c.usuarioId, texto(f, "lista"));
    return r.encerrou ? "Lista publicada. A lista anterior desta série foi encerrada." : "Lista publicada.";
  });
}

export async function encerrarListaAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  return executar(async (c) => {
    await cad.encerrarLista(c.usuarioId, texto(f, "lista"));
    return "Lista encerrada. Ela saiu do ar para os pais.";
  });
}

export async function excluirListaAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  const r = await executar((c) => cad.excluirLista(c.usuarioId, texto(f, "lista")));
  if (r.erro) return r;
  redirect("/painel/escolas");
}

// -------------------------------------------------------------------- loja

/**
 * Lê o card de descontos. Regra com percentual em branco e desligada some;
 * ligada sem percentual é erro. O percentual fica guardado mesmo desligado,
 * para a papelaria religar sem digitar de novo.
 */
function lerDescontos(f: FormData): RegrasDeDesconto | string {
  const out: RegrasDeDesconto = {};
  for (const regra of REGRAS) {
    const ativo = f.get(`desc_${regra}`) === "on";
    const bruto = texto(f, `desc_${regra}_pct`).replace("%", "").trim();
    if (!bruto) {
      if (ativo) return `${TITULO_REGRA[regra]}: informe a porcentagem do desconto.`;
      continue;
    }
    const percentual = Number(bruto.replace(",", "."));
    if (!Number.isInteger(percentual) || percentual < 1 || percentual > 50) {
      return `${TITULO_REGRA[regra]}: a porcentagem vai de 1 a 50, sem casas decimais.`;
    }
    if (regra === "valor_minimo") {
      const minimo = centavosDe(texto(f, "desc_valor_minimo_min"));
      if (minimo === null) return "Valor mínimo: informe a partir de quantos reais vale o desconto.";
      out.valor_minimo = { ativo, percentual, minimo_centavos: minimo };
    } else if (regra === "faixa") {
      const faixa = texto(f, "desc_faixa_faixa") as Faixa;
      if (!FAIXAS.includes(faixa)) return "Faixa da lista: escolha a faixa.";
      out.faixa = { ativo, percentual, faixa };
    } else {
      out[regra] = { ativo, percentual };
    }
  }
  return out;
}

export async function salvarLojaAcao(_: EstadoDaAcao, f: FormData): Promise<EstadoDaAcao> {
  const descontos = lerDescontos(f);
  if (typeof descontos === "string") return { erro: descontos };
  const whats = texto(f, "whatsapp").replace(/\D/g, "");
  const taxa = texto(f, "taxa").trim();
  const taxaCentavos = taxa === "" || /^0+([,.]0+)?$/.test(taxa) ? 0 : centavosDe(taxa);
  if (taxaCentavos === null) return { erro: "Taxa de entrega inválida." };
  return executar(async (c) => {
    await cad.salvarLoja(c.usuarioId, c.fornecedorId, {
      nome: texto(f, "nome"),
      whatsapp: whats || null,
      endereco_retirada: texto(f, "endereco_retirada"),
      aceita_entrega: f.get("aceita_entrega") === "on",
      aceita_retirada: f.get("aceita_retirada") === "on",
      taxa_entrega_centavos: taxaCentavos,
      parcelas_maximas: inteiro(f, "parcelas"),
      descontos,
    });
    return "Dados da loja salvos.";
  });
}
