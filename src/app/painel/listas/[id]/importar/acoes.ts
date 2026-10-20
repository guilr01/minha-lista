"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ArquivoIlegivel, textoDoArquivo } from "@/lib/arquivo-de-lista";
import { ErroDeCadastro, importarItensDaLista, listarProdutos } from "@/lib/cadastro";
import { lerLinhas, sugeridor, vocabularioDoCatalogo, type LinhaDaEscola, type Sugestao } from "@/lib/lista-da-escola";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";

// Conferir não grava nada: lê a lista da escola e devolve, por linha, os
// produtos do catálogo mais parecidos. Gravar recebe o que a PAPELARIA
// decidiu na conferência, e o banco (RLS e chaves compostas) recusa produto
// ou lista de outra papelaria.

const TAMANHO_MAXIMO = 3 * 1024 * 1024;
const LINHAS_MAXIMAS = 400;

export type LinhaConferida = LinhaDaEscola & { sugestoes: Sugestao[] };
export type Conferencia = { erro?: string; linhas?: LinhaConferida[] };

async function contexto() {
  const u = await exigirUsuario();
  const p = await papelariaAtual(u.id);
  if (!p) redirect("/painel");
  return { usuarioId: u.id, fornecedorId: p.id };
}

export async function conferirListaDaEscolaAcao(f: FormData): Promise<Conferencia> {
  const c = await contexto();
  let texto = String(f.get("texto") ?? "");
  const arquivo = f.get("arquivo");
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > TAMANHO_MAXIMO) return { erro: "O arquivo passa de 3 MB." };
    try {
      texto = await textoDoArquivo(arquivo.name, await arquivo.arrayBuffer());
    } catch (e) {
      if (e instanceof ArquivoIlegivel) return { erro: e.message };
      throw e;
    }
  }
  if (!texto.trim()) return { erro: "Envie o arquivo da lista ou cole o texto dela." };
  const produtos = (await listarProdutos(c.usuarioId, c.fornecedorId)).filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }));
  // O catálogo entra também na LEITURA: o que a loja vende é material escolar,
  // e isso ajuda a separar item de recado.
  const linhas = lerLinhas(texto, { vocabulario: vocabularioDoCatalogo(produtos) }).slice(0, LINHAS_MAXIMAS);
  if (!linhas.length) return { erro: "Não encontrei texto nenhum neste arquivo. Confira se é a lista de material." };
  const sugerir = sugeridor(produtos);
  // A observação entra na comparação: "(24 cores)" é o que separa o lápis de 12 do de 24.
  return { linhas: linhas.map((l) => ({ ...l, sugestoes: sugerir(`${l.descricao} ${l.observacao}`) })) };
}

export type Decisao =
  | { tipo: "produto"; produto_id: string; quantidade: number; observacao: string }
  | { tipo: "indisponivel"; texto: string };

export async function gravarListaDaEscolaAcao(listaId: string, decisoes: Decisao[]): Promise<{ erro?: string }> {
  const c = await contexto();
  if (!Array.isArray(decisoes) || decisoes.length > LINHAS_MAXIMAS) return { erro: "Conferência inválida. Recarregue a página." };
  const itens = decisoes.filter((d): d is Extract<Decisao, { tipo: "produto" }> => d?.tipo === "produto")
    .map((d) => ({ produto_id: String(d.produto_id), quantidade: Number(d.quantidade), observacao: String(d.observacao ?? "") }));
  const indisponiveis = decisoes.filter((d): d is Extract<Decisao, { tipo: "indisponivel" }> => d?.tipo === "indisponivel")
    .map((d) => String(d.texto ?? ""));
  if (!itens.length && !indisponiveis.length) return { erro: "Nenhuma linha para gravar: todas estão como ignoradas." };
  try {
    await importarItensDaLista(c.usuarioId, c.fornecedorId, listaId, itens, indisponiveis);
  } catch (e) {
    if (e instanceof ErroDeCadastro) return { erro: e.message };
    console.error("[importar lista]", e);
    return { erro: "Não foi possível gravar agora. Nada foi alterado; tente de novo." };
  }
  revalidatePath("/painel", "layout");
  redirect(`/painel/listas/${listaId}?importada=1`);
}
