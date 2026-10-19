// A lista que a escola manda (PDF, Word, Excel ou texto colado), lida linha a
// linha e comparada com o catálogo da papelaria. Puro de propósito: sem
// banco e sem arquivo, para o teste alcançar cada regra. Quem lê o arquivo é
// src/lib/arquivo-de-lista.ts; quem grava é a ação da tela de importar.
//
// A comparação SUGERE, não decide: a papelaria confere linha a linha antes
// de qualquer item entrar na lista.

export type LinhaDaEscola = {
  /** O texto como veio, para a papelaria reconhecer. */
  original: string;
  quantidade: number;
  /** O que sobra tirando quantidade e marcadores: "lápis de cor 24 cores". */
  descricao: string;
  /** O que a escola pôs entre parênteses: "(capa dura)". */
  observacao: string;
  /** Título de seção ("Material de uso individual:"): começa ignorado. */
  cabecalho: boolean;
};

const NUMEROS_ESCRITOS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  doze: 12, vinte: 20,
};

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Quebra o texto da escola em linhas de item. */
export function lerLinhas(texto: string): LinhaDaEscola[] {
  const out: LinhaDaEscola[] = [];
  for (const bruta of texto.replace(/\r/g, "").split(/\n|;(?=\s*\S)/)) {
    const original = bruta.replace(/\s+/g, " ").trim();
    if (original.replace(/[^\p{L}]/gu, "").length < 3) continue; // sem palavra: régua, numeração, linha em branco

    let resto = original.replace(/^[-–—•*·▪●◦>]+\s*/, "");
    let quantidade: number | null = null;

    // "1. 2 lápis" é numeração seguida de quantidade; "1. lápis" ou "01 lápis" é quantidade.
    const numeracao = resto.match(/^\d{1,2}[.)]\s+(?=\d)/);
    if (numeracao) resto = resto.slice(numeracao[0].length);
    const inicio = resto.match(/^(\d{1,3})\s*(?:x\b|un\b\.?|und\b\.?|unid\w*\.?|pcts?\b\.?|cx\b\.?|[-–—.):])?\s*/i);
    if (inicio && Number(inicio[1]) > 0) {
      quantidade = Number(inicio[1]);
      resto = resto.slice(inicio[0].length);
    } else {
      const escrito = semAcento(resto).match(/^(\p{L}+)\s+/u);
      if (escrito && NUMEROS_ESCRITOS[escrito[1].toLowerCase()]) {
        quantidade = NUMEROS_ESCRITOS[escrito[1].toLowerCase()];
        resto = resto.slice(escrito[0].length);
      }
    }
    // No fim: "lápis - 2 unidades", "cola (2)", "borracha x2".
    if (quantidade === null) {
      const fim = resto.match(/\s*(?:[-–—:,]\s*|\(\s*|\bx\s*)(\d{1,3})\s*(?:un\w*|und\.?|p[çc]s?|pacotes?|caixas?)?\s*\)?\s*\.?$/i);
      if (fim && Number(fim[1]) > 0) {
        quantidade = Number(fim[1]);
        resto = resto.slice(0, fim.index);
      }
    }

    const parenteses = [...resto.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
    const descricao = resto.replace(/\([^)]*\)/g, " ").replace(/[\s.,;:–—-]+$/, "").replace(/\s+/g, " ").trim();
    if (descricao.replace(/[^\p{L}]/gu, "").length < 3) continue;

    out.push({
      original,
      quantidade: Math.min(99, quantidade ?? 1),
      descricao,
      observacao: parenteses.join("; ").slice(0, 120),
      // Título de seção: termina em ":" ou é todo em maiúsculas, sem quantidade.
      cabecalho: quantidade === null && (/:$/.test(original) || (original === original.toUpperCase() && /\p{L}{4}/u.test(original))),
    });
  }
  return out;
}

// --------------------------------------------------------------- comparação

const ABREVIACOES: Record<string, string> = {
  fls: "folhas", fl: "folhas", folha: "folhas", cx: "caixa", c: "com", und: "unidade", un: "unidade",
  unid: "unidade", pct: "pacote", pcts: "pacote", n: "numero", no: "numero", cm: "cm", ml: "ml", gr: "g",
  grs: "g", lapis: "lapis", cad: "caderno", univ: "universitario", hidrocor: "hidrografica",
  canetinha: "hidrografica", canetinhas: "hidrografica",
};
const VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "com", "para", "p", "a", "o", "as", "os", "e", "em", "no", "na", "tipo",
  "unidade", "unidades", "pacote", "caixa", "marca", "sugestao", "obs", "ou", "um", "uma", "sem",
]);

/** As palavras que contam na comparação, já sem acento, plural e abreviação. */
export function palavras(s: string): string[] {
  return semAcento(s.toLowerCase())
    .replace(/n[º°]\s*/g, "numero ")
    .replace(/(\d)\s*(fls|folhas|cm|ml|g|cores)\b/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((p) => ABREVIACOES[p] ?? p)
    .map((p) => (/^[a-z]{4,}s$/.test(p) && !p.endsWith("ss") && p !== "lapis" ? p.slice(0, -1) : p))
    .filter((p) => !VAZIAS.has(p));
}

export type ProdutoParaCasar = { id: string; nome: string };
export type Sugestao = { produto_id: string; nome: string; pontos: number };

/**
 * Nota de 0 a 1 entre a linha e um produto. A primeira palavra é o "o que é"
 * (lápis, caderno, cola): sem ela em comum, a nota cai pela metade, para
 * "cola colorida" não ganhar de "cola bastão" só por causa de "colorida".
 */
function nota(linha: string[], produto: string[]): number {
  if (!linha.length || !produto.length) return 0;
  const l = new Set(linha);
  const p = new Set(produto);
  const comum = [...l].filter((x) => p.has(x));
  if (!comum.length) return 0;
  let n = (2 * comum.length) / (l.size + p.size);
  if (!l.has(produto[0]) && !p.has(linha[0])) n /= 2;
  // Número que a linha tem e o produto contradiz (24 cores × 12 cores) pesa contra.
  const numL = linha.filter((x) => /^\d+$/.test(x));
  const numP = produto.filter((x) => /^\d+$/.test(x));
  if (numL.length && numP.length && !numL.some((x) => p.has(x))) n *= 0.6;
  return n;
}

/** Nota mínima para sugerir um produto; abaixo dela a linha começa como indisponível. */
export const NOTA_MINIMA = 0.4;

/** Os até 3 produtos mais parecidos com a linha, do melhor para o pior. */
export function sugerir(descricao: string, produtos: ProdutoParaCasar[]): Sugestao[] {
  const l = palavras(descricao);
  return produtos
    .map((p) => ({ produto_id: p.id, nome: p.nome, pontos: Math.round(nota(l, palavras(p.nome)) * 100) / 100 }))
    .filter((s) => s.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome))
    .slice(0, 3);
}

// -------------------------------------------- o recado com o que falta

const TITULO_INDISPONIVEIS = "Itens da lista da escola que não vendemos:";

/**
 * Junta ao recado da lista os itens que a papelaria não oferece, para o
 * cliente saber que precisa comprar em outro lugar. Importar de novo troca
 * o bloco anterior em vez de repetir.
 */
export function recadoComIndisponiveis(recado: string | null, itens: string[]): string {
  const semBloco = (recado ?? "").split(TITULO_INDISPONIVEIS)[0].trim();
  if (!itens.length) return semBloco;
  const bloco = [TITULO_INDISPONIVEIS, ...itens.map((i) => `• ${i}`)].join("\n");
  return semBloco ? `${semBloco}\n\n${bloco}` : bloco;
}
