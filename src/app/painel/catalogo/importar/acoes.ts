"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ErroDeCadastro, importarCatalogo, listarProdutos, type ResultadoDaImportacao } from "@/lib/cadastro";
import { PlanilhaInvalida, chaveDoNome, lerPlanilha, type LeituraDaPlanilha } from "@/lib/planilha-catalogo";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import type { Faixa } from "@/lib/faixa";

// Conferir e importar recebem o MESMO arquivo e o leem de novo no servidor:
// o que é gravado nunca vem do navegador já mastigado.

const TAMANHO_MAXIMO = 3 * 1024 * 1024;

export type Previa = {
  erro?: string;
  total?: number;
  novos?: number;
  atualizados?: number;
  erros?: LeituraDaPlanilha["erros"];
  amostra?: { linha: number; nome: string; categoria: string; novo: boolean; opcoes: Partial<Record<Faixa, { marca: string; preco_centavos: number }>> }[];
  resultado?: ResultadoDaImportacao;
};

async function ler(f: FormData) {
  const u = await exigirUsuario();
  const p = await papelariaAtual(u.id);
  if (!p) redirect("/painel");
  const arquivo = f.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha." } as const;
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "O arquivo passa de 3 MB. Divida a planilha em partes." } as const;
  try {
    return { u, p, leitura: await lerPlanilha(await arquivo.arrayBuffer()) } as const;
  } catch (e) {
    if (e instanceof PlanilhaInvalida) return { erro: e.message } as const;
    throw e;
  }
}

export async function conferirPlanilhaAcao(f: FormData): Promise<Previa> {
  const r = await ler(f);
  if ("erro" in r) return { erro: r.erro };
  const existentes = new Set((await listarProdutos(r.u.id, r.p.id)).map((x) => chaveDoNome(x.nome)));
  const marcadas = r.leitura.linhas.map((l) => ({ ...l, novo: !existentes.has(chaveDoNome(l.nome)) }));
  return {
    total: marcadas.length,
    novos: marcadas.filter((l) => l.novo).length,
    atualizados: marcadas.filter((l) => !l.novo).length,
    erros: r.leitura.erros,
    amostra: marcadas.map(({ linha, nome, categoria, novo, opcoes }) => ({ linha, nome, categoria, novo, opcoes })),
  };
}

export async function importarPlanilhaAcao(f: FormData): Promise<Previa> {
  const r = await ler(f);
  if ("erro" in r) return { erro: r.erro };
  if (!r.leitura.linhas.length) return { erro: "Nenhuma linha válida para importar." };
  try {
    const resultado = await importarCatalogo(r.u.id, r.p.id, r.leitura.linhas);
    revalidatePath("/painel", "layout");
    return { resultado };
  } catch (e) {
    if (e instanceof ErroDeCadastro) return { erro: e.message };
    console.error("[importar catálogo]", e);
    return { erro: "Não foi possível importar agora. Nada foi gravado; tente de novo." };
  }
}
