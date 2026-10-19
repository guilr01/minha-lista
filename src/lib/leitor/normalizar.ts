import type { ItemLido, ListaLida } from "./tipos";

// O que o modelo devolve passa por aqui antes de chegar à tela. O modelo
// padroniza o NOME; esta função garante a FORMA: espaços, quantidade inteira e
// positiva, especificação sem repetição, e o mesmo item escrito duas vezes
// virando uma linha só, com as quantidades somadas.

function espacos(t: string): string {
  return t.replace(/\s+/g, " ").trim();
}

// Cópia de paraBusca (src/lib/texto.ts) de propósito: esta pasta não importa
// nada do aplicativo, para poder ser levada ao agregador inteira.
function semAcento(t: string): string {
  return t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * A identidade de um item: nome e especificações, sem acento, sem caixa e sem
 * ordem. "Lápis HB" e "lapis hb" são o mesmo item; é também a chave que o
 * casamento com um catálogo vai usar.
 */
export function chaveDoItem(item: Pick<ItemLido, "nome" | "especificacoes">): string {
  const specs = item.especificacoes.map((e) => semAcento(espacos(e))).filter(Boolean).sort();
  return [semAcento(espacos(item.nome)), ...specs].join(" | ");
}

function quantidade(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.round(q));
}

function capitalizar(t: string): string {
  return t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
}

export function normalizarItens(itens: ItemLido[]): ItemLido[] {
  const porChave = new Map<string, ItemLido>();
  for (const bruto of itens) {
    const nome = capitalizar(espacos(bruto.nome));
    if (!nome) continue;
    const vistas = new Set<string>();
    const especificacoes = bruto.especificacoes.map(espacos).filter((e) => {
      const k = semAcento(e);
      if (!e || vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
    const item: ItemLido = {
      texto_original: espacos(bruto.texto_original),
      nome,
      quantidade: quantidade(bruto.quantidade),
      especificacoes,
      observacao: bruto.observacao ? espacos(bruto.observacao) || null : null,
    };

    const chave = chaveDoItem(item);
    const ja = porChave.get(chave);
    if (!ja) {
      porChave.set(chave, item);
      continue;
    }
    // Repetido na lista: uma linha, quantidades somadas, e os dois trechos
    // originais à vista, para ninguém achar que um sumiu.
    ja.quantidade += item.quantidade;
    if (item.texto_original && item.texto_original !== ja.texto_original) {
      ja.texto_original = `${ja.texto_original} / ${item.texto_original}`;
    }
    if (item.observacao && item.observacao !== ja.observacao) {
      ja.observacao = ja.observacao ? `${ja.observacao}; ${item.observacao}` : item.observacao;
    }
  }
  return [...porChave.values()];
}

export function normalizarLista(lista: ListaLida): ListaLida {
  return {
    nao_e_lista: lista.nao_e_lista,
    itens: normalizarItens(lista.itens),
    ilegiveis: lista.ilegiveis.map(espacos).filter(Boolean),
  };
}
