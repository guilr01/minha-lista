// A lista que a escola manda (PDF, Word, Excel ou texto colado), lida trecho a
// trecho e comparada com o catálogo da papelaria. Puro de propósito: sem
// banco e sem arquivo, para o teste alcançar cada regra. Quem lê o arquivo é
// src/lib/arquivo-de-lista.ts; quem grava é a ação da tela de importar.
//
// A comparação SUGERE, não decide: a papelaria confere linha a linha antes
// de qualquer item entrar na lista.

export type LinhaDaEscola = {
  /** O trecho como veio, para a papelaria reconhecer. */
  original: string;
  quantidade: number;
  /** O que sobra tirando quantidade, marcadores e preço: "lápis de cor 24 cores". */
  descricao: string;
  /** O que a escola pôs entre parênteses: "(capa dura)". */
  observacao: string;
  /**
   * Parece item de material? Título, recado, data, contato e parágrafo de
   * instrução vêm com false: ficam fora da conferência, num bloco à parte,
   * e a papelaria traz de volta o que for item.
   */
  item: boolean;
};

const NUMEROS_ESCRITOS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  doze: 12, vinte: 20,
};

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Minúsculo e sem acento com o MESMO comprimento: um índice achado aqui vale no texto original (já em NFC). */
const chave = (s: string) => s.replace(/[À-ÿ]/g, (c) => semAcento(c) || c).toLowerCase();

const letras = (s: string) => s.replace(/[^\p{L}]/gu, "").length;
const contarPalavras = (s: string) => s.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
const singular = (p: string) => (/^[a-z]{4,}s$/.test(p) && !p.endsWith("ss") && p !== "lapis" ? p.slice(0, -1) : p);

// ------------------------------------------------- o que é material escolar
//
// Decidir se um trecho é item não depende só do formato da linha: "Todo
// material deverá ser etiquetado" tem a cara de uma linha de lista. O que
// decide é o conjunto: tem quantidade? começa por um objeto que se compra
// em papelaria? fala como recado ("deverá", "solicitamos")? é data, contato?
// está debaixo de "Observações:" ou de "Material de uso individual:"?
// O vocabulário abaixo soma-se às palavras do catálogo da própria loja.

const OBJETO_INTEIRO = new Set([
  "giz", "cera", "cola", "eva", "tnt", "cd", "dvd", "clip", "clips", "durex", "guache", "pote", "copo", "prato", "kit",
  "foto", "refil", "isopor", "massa", "lixa", "tela", "fone", "lupa", "regua", "etiqueta",
]);
const OBJETO_PREFIXO = [
  "cadern", "lapis", "borrach", "apontad", "tesour", "estoj", "mochil", "lancheir", "agend", "canet", "hidrocor",
  "hidrograf", "marcador", "marcatexto", "tinta", "pincel", "pincei", "papel", "papei", "sulfite", "cartolin", "crepom",
  "colorset", "feltro", "massinh", "argila", "pasta", "envelop", "fichari", "bloco", "livro", "dicionari", "apostil",
  "fita", "barbant", "glitter", "gliter", "purpurin", "lantejoul", "palito", "prendedor", "pregador", "grampead",
  "clipe", "corretiv", "compasso", "transferidor", "esquadro", "calculador", "flauta", "avental", "toalh", "garraf",
  "squeeze", "escov", "creme", "sabonet", "lenco", "jogo", "quebra", "brinquedo", "revist", "gibi", "caderneta",
  "plastic", "contact", "adesiv", "carimbo", "almofad", "prancheta", "pendrive", "novelo", "botao", "botoe",
  "micang", "alfinet", "percevejo", "elastic", "bastao", "grafite", "tecido", "saquinh", "sacola", "flanela", "esponj",
  "pratinh", "guardanap", "tampinh", "cordao", "papelao", "pistola", "caneca", "regua", "mapa", "globo", "dado",
];
/** "Caixa", "pacote", "folhas": objeto só quando dizem de quê ("caixa de sapato", "2 folhas de EVA"). */
const RECIPIENTE = new Set([
  "caixa", "cx", "pacote", "pct", "pote", "tubo", "frasco", "folha", "fls", "rolo", "conjunto", "par", "metro",
  "vidro", "embalagem", "resma", "maco", "saco", "unidade",
]);
const LIGACAO = new Set([
  "de", "da", "do", "das", "dos", "com", "c", "para", "p", "o", "a", "os", "as", "um", "uma", "uns", "umas", "e", "em",
  "no", "na", "nos", "nas", "tipo", "sem", "ou", "ate", "por", "ao", "aos",
]);
/** Depois de um número, estas palavras são medida do item ("96 folhas", "24 cores"), não quantidade. */
const MEDIDA = /^(?:cores|materias|cm|mm|m|metros?|ml|l|litros?|g|gr|gramas|kg|paginas|pags?|x)\b/;

/** Fala como recado ou aviso: um item nunca diz "deverá", "solicitamos", "reunião". */
const FRASE = new RegExp(String.raw`\b(?:devem?|devera|deverao|devendo|sera|serao|seja|sejam|favor|solicit\w*|pedimos|lembr\w*|podera|poderao|ficara|ficarao|permanec\w*|sugerimos|recomend\w*|informamos|comunicamos|reuniao|inicio|horario|matricula|mensalidade|calendario|letivo|bimestre|semestre|trimestre|nome do aluno|todos?|todas?|cada)\b`);
/** Fala da escola, não do objeto: só pesa quando o trecho não começa por um objeto. */
const CONTEXTO = new RegExp(String.raw`\b(?:entreg\w*|utiliz\w*|identific\w*|etiquetad\w*|encapad\w*|marcad[oa]s?|vendid\w*|comprad\w*|adquirid\w*|devolv\w*|retirad\w*|guardad\w*|obrigatori\w*|importante|atencao|observac\w*|obs|secretaria|coordenac\w*|diretoria|responsave\w*|durante|conforme|necessidade|reposic\w*|uniforme|escola|colegio|alunos?|criancas?|turma|prof|professor\w*|ensino|fundamental|infantil|aulas?|semana|pais|sala)\b`);
const DATA = /\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}h(?:\d{2})?\b|\b\d{1,2}:\d{2}\b|\b(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/;
const CONTATO = /@|www\.|https?:|\btel\b|telefone|whatsapp|\bcep\b|\bcnpj\b|\brua\b|\bavenida\b|\bav\.|\(\d{2}\)\s*\d|\d{4,5}-\d{4}/;

/** Título de seção: "Material de uso individual", "LIVROS", "Observações". */
const TITULO = /^(?:lista\b.*|materia(?:l|is)\b.*|livros?(?: didaticos?| paradidaticos?| de literatura)?|paradidaticos?|itens\b.*|uso (?:individual|coletivo|pessoal)\b.*|observac\w*.*|informac\w*.*|importante\b.*|atencao\b.*|recados?\b.*|avisos?\b.*|uniforme\b.*|obs)$/;
const SECAO_TEXTO = /observ|informac|importante|atenc|recado|aviso|uniforme|reuniao|horario|calendario|\bobs\b/;
const SECAO_LISTA = /materia|lista|livro|iten|\buso\b|paradidat|apostil|\bkit\b|\bartes?\b/;

/** O verbo que abre uma lista em texto corrido: tudo antes dele é recado. */
const INTRODUTOR = /\b(?:trazer|tragam?|providenciar|adquirir|comprar|enviar|solicitamos|pedimos|recomendamos|sugerimos|necessarios?|precisar(?:a|ao)? de|composto por|compost[oa]s? de|sao eles|a seguir|seguintes?(?: materiais| itens)?)\b\s*:?/;

const PRECO = /R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|(?<![\w.,/])\d+[.,]\d{1,2}(?:\s*\/\s*\d+[.,]\d{1,2})*(?![\w.,/]|\s*(?:cm|mm|m|ml|l|kg|g|mg|litros?|metros?)\b)/gi;
const MARCADOR = /^(?:[-–—•*·▪●◦>➢►✓✔]+\s*|[a-z][).]\s+)/i;

type Vocabulario = { tem(palavra: string): boolean };

function termos(c: string): string[] {
  return c.replace(/marca[\s-]+textos?/g, "marcatexto").split(/[^a-z0-9]+/).filter((w) => w && !LIGACAO.has(w));
}

function ehObjeto(w: string, extra: Vocabulario): boolean {
  const s = singular(w);
  return OBJETO_INTEIRO.has(w) || OBJETO_INTEIRO.has(s) || extra.tem(w) || extra.tem(s) || OBJETO_PREFIXO.some((p) => w.startsWith(p));
}

/** O trecho COMEÇA por um objeto ("tesoura sem ponta", "caixa de sapato")? */
function comecaPorObjeto(c: string, extra: Vocabulario): boolean {
  const ts = termos(c).filter((w) => !/^\d+$/.test(w));
  if (!ts.length) return false;
  if (ehObjeto(ts[0], extra)) return true;
  return RECIPIENTE.has(singular(ts[0])) && ts.length >= 2;
}

/** Algum objeto entre as primeiras palavras ("Ápis · livro do 1º ano" não; "novo caderno" sim). */
function temObjeto(c: string, extra: Vocabulario): boolean {
  return termos(c).filter((w) => !/^\d+$/.test(w)).slice(0, 4).some((w) => ehObjeto(w, extra));
}

/** Depois de uma vírgula ou de um "e", começa um item novo, ou é a continuação do anterior ("capa dura", "96 folhas")? */
function iniciaItem(trecho: string, extra: Vocabulario): boolean {
  const c = chave(trecho.trim()).replace(MARCADOR, "");
  const num = c.match(/^(\d{1,3})\s*([a-z]*)/);
  if (num) {
    if (!num[2] || MEDIDA.test(num[2])) return false;
    if (/^(?:folhas?|fls)$/.test(num[2]) && Number(num[1]) >= 20) return false;
    return true;
  }
  const escrito = c.match(/^([a-z]+)\s/);
  if (escrito && NUMEROS_ESCRITOS[escrito[1]] && !/^(?:um|uma)\s+(?:vez|pouco)/.test(c)) return true;
  return comecaPorObjeto(c, extra);
}

/** Quebra uma frase em itens por vírgula, ponto e vírgula e "e", fora dos parênteses, juntando de volta o que é continuação. */
function dividirLista(frase: string, extra: Vocabulario): { sep: string; texto: string }[] {
  const pedacos: { sep: string; texto: string }[] = [];
  let atual = "";
  let sep = "";
  let fundo = 0;
  for (let i = 0; i < frase.length; i++) {
    const ch = frase[i];
    if (ch === "(") fundo++;
    else if (ch === ")") fundo = Math.max(0, fundo - 1);
    let corte = "";
    if (fundo === 0) {
      if (ch === ";" || (ch === "," && !(/\d/.test(frase[i - 1] ?? "") && /\d/.test(frase[i + 1] ?? "")))) corte = ch + " ";
      else if (/^ e /i.test(frase.slice(i, i + 3))) corte = " e ";
    }
    if (!corte) { atual += ch; continue; }
    pedacos.push({ sep, texto: atual });
    sep = corte;
    atual = "";
    if (corte === " e ") i += 2;
  }
  pedacos.push({ sep, texto: atual });

  const out: { sep: string; texto: string }[] = [];
  for (const p of pedacos) {
    if (!p.texto.trim()) continue;
    if (out.length && !iniciaItem(p.texto, extra)) out[out.length - 1].texto += p.sep.trimStart() === "e " ? p.sep + p.texto.trim() : p.sep.trimEnd() + " " + p.texto.trim();
    else out.push({ sep: p.sep, texto: p.texto.trim() });
  }
  return out;
}

/** Quantidade, descrição e observação de um trecho que pode ser item. */
function lerTrecho(trecho: string) {
  let resto = trecho.replace(MARCADOR, "");
  let quantidade: number | null = null;

  // "1. 2 lápis" é numeração seguida de quantidade; "1. lápis" ou "01 lápis" é quantidade.
  const numeracao = resto.match(/^\d{1,2}[.)]\s+(?=\d)/);
  if (numeracao) resto = resto.slice(numeracao[0].length);
  // Não é quantidade: "1º ano", "30/01", "10:30", "96 folhas", "24 cores".
  const inicio = resto.match(/^(\d{1,3})(?!\d)(?![ºª°]|[oa]\b)(?!\s*[/,.:]\s*\d)\s*(?:x\b|un\b\.?|und\b\.?|unid\w*\.?|pcts?\b\.?|cx\b\.?|[-–—.):])?\s*/i);
  if (inicio && Number(inicio[1]) > 0) {
    const depois = chave(resto.slice(inicio[0].length));
    const medida = MEDIDA.test(depois) || (/^(?:folhas?|fls)\b/.test(depois) && Number(inicio[1]) >= 20);
    if (!medida) {
      quantidade = Number(inicio[1]);
      resto = resto.slice(inicio[0].length);
    }
  } else {
    const escrito = chave(resto).match(/^(\p{L}+)\s+/u);
    if (escrito && NUMEROS_ESCRITOS[escrito[1]]) {
      quantidade = NUMEROS_ESCRITOS[escrito[1]];
      resto = resto.slice(escrito[0].length);
    }
  }
  // "02 (dois) cadernos": o número por extenso entre parênteses não é observação.
  const extenso = resto.match(/^\(\s*([^)]*?)\s*\)\s*/);
  if (extenso && NUMEROS_ESCRITOS[chave(extenso[1])]) resto = resto.slice(extenso[0].length);
  // No fim: "lápis - 2 unidades", "cola (2)", "borracha x2".
  if (quantidade === null) {
    const fim = resto.match(/\s*(?:[-–—:,]\s*|\(\s*|\bx\s*)(\d{1,3})\s*(?:un\w*|und\.?|p[çc]s?|pacotes?|caixas?)?\s*\)?\s*\.?$/i);
    if (fim && Number(fim[1]) > 0) {
      quantidade = Number(fim[1]);
      resto = resto.slice(0, fim.index);
    }
  }

  const parenteses = [...resto.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  const descricao = resto.replace(/\([^)]*\)/g, " ").replace(/[\s.,;:–—-]+$/, "").replace(/^[\s.,;:–—-]+/, "").replace(/\s+/g, " ").trim();
  return { quantidade, descricao, observacao: parenteses.join("; ").slice(0, 120) };
}

type Secao = "lista" | "texto" | null;

/** A decisão: item ou texto. */
function pareceItem(descricao: string, quantidade: number | null, secao: Secao, extra: Vocabulario): boolean {
  const c = chave(descricao);
  const palavras = contarPalavras(descricao);
  const frase = FRASE.test(c) || DATA.test(c) || CONTATO.test(c);
  const objeto = comecaPorObjeto(c, extra) || temObjeto(c, extra);
  if (quantidade !== null) return objeto || !(frase || CONTEXTO.test(c));
  if (frase) return false;
  if (comecaPorObjeto(c, extra) && palavras <= 10) return true;
  if (CONTEXTO.test(c) || palavras > 12) return false;
  if (objeto) return true;
  return secao === "lista" && palavras <= 10;
}

/**
 * O PDF quebra a frase no fim da linha do papel: "…lápis, borracha e uma" /
 * "caixa de giz de cera." Junta a linha à seguinte quando ela claramente
 * continua (termina em vírgula ou em palavra de ligação, ou é frase de
 * recado) e a seguinte começa minúscula. Lista em minúsculas sem marcador
 * não junta: "caderno brochura" / "lápis preto" são dois itens.
 */
function juntarQuebras(linhas: string[]): string[] {
  const out: string[] = [];
  for (const bruta of linhas) {
    const l = bruta.trim();
    const ant = out.length ? out[out.length - 1] : "";
    const c = chave(ant);
    const continua = /[,;]$/.test(ant) || /\b(?:e|de|da|do|das|dos|com|um|uma|os|as|o|a|que|para|na|no|em|ou)$/.test(c)
      || (contarPalavras(ant) >= 6 && !/[.!?:]$/.test(ant) && (FRASE.test(c) || CONTEXTO.test(c)));
    // "a) 1 pasta" começa minúscula, mas é item novo: marcador de lista nunca continua a linha de cima.
    if (ant && continua && /^\p{Ll}/u.test(l) && !MARCADOR.test(l)) out[out.length - 1] = `${ant} ${l}`;
    else out.push(l);
  }
  return out;
}

/**
 * Lê o texto da escola e devolve os trechos, cada um marcado como item ou
 * texto. `vocabulario` são as palavras que abrem os nomes do catálogo da
 * loja: o que ela vende é, por definição, material escolar.
 */
export function lerLinhas(texto: string, opcoes: { vocabulario?: Iterable<string> } = {}): LinhaDaEscola[] {
  const doCatalogo = new Set([...(opcoes.vocabulario ?? [])].map(chave).filter((w) => /^[a-z]{3,}$/.test(w)));
  const extra: Vocabulario = { tem: (w) => doCatalogo.has(w) };
  const out: LinhaDaEscola[] = [];
  let secao: Secao = null;

  const fora = (original: string, descricao = original) => {
    if (letras(descricao) >= 3) out.push({ original: original.trim(), quantidade: 1, descricao: descricao.trim(), observacao: "", item: false });
  };
  const titulo = (t: string) => {
    const c = chave(t);
    if (SECAO_TEXTO.test(c)) secao = "texto";
    else if (SECAO_LISTA.test(c)) secao = "lista";
  };
  const ehTitulo = (bruto: string) => {
    // "MATERIAL DE USO COLETIVO (entregar na primeira semana)": o parêntese não conta.
    const t = bruto.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const c = chave(t).replace(/[:\s]+$/, "");
    if (/^\d/.test(c) && lerTrecho(t).quantidade !== null) return false;
    if (contarPalavras(t) <= 6 && TITULO.test(c)) return true;
    const so = t.replace(/[^\p{L}]/gu, "");
    return so.length >= 4 && so === so.toUpperCase() && contarPalavras(t) <= 10 && !comecaPorObjeto(c, extra) && lerTrecho(t).quantidade === null;
  };

  for (const bruta of juntarQuebras(texto.normalize("NFC").replace(/\r/g, "").split("\n"))) {
    const linha = bruta.replace(/\s+/g, " ").replace(PRECO, " ").replace(/\s+/g, " ").replace(/[\s–—-]+$/, "").trim();
    if (letras(linha) < 3) continue;

    // Frases e marcadores no meio da linha. "1." sozinho é numeração e volta a colar no que vem depois.
    const frases: string[] = [];
    for (const f of linha.split(/\s+[•▪●◦➢►✓✔]\s*|(?<=(?:\p{L}{3}|\d|\))[.!?])(?<!\b(?:fls|pct|und|unid|aprox|ref|pag|sra|prof|dra)\.)\s+(?=[\p{Lu}\d])/u)) {
      if (frases.length && /^\d{1,3}[.)]$/.test(frases[frases.length - 1])) frases[frases.length - 1] += " " + f;
      else frases.push(f);
    }

    for (const bruta of frases) {
      let frase = bruta.replace(MARCADOR, "").trim();
      if (letras(frase) < 3) continue;
      // Rótulo ou recado que abre a frase: gruda no texto que vem logo depois
      // ("Reunião de pais: 30/01 às 19h" é UM aviso), ou sai sozinho antes do item.
      let pendente: string | null = null;

      // "Material de uso individual: 2 cadernos, 1 estojo" e "Reunião de pais: 30/01". Hora (10:30) não conta.
      const dp = frase.search(/:(?!\d)/);
      if (dp >= 0) {
        const antes = frase.slice(0, dp).trim();
        const depois = frase.slice(dp + 1).trim();
        const cAntes = chave(antes);
        const rotulo = contarPalavras(antes) <= 8 && lerTrecho(antes).quantidade === null
          && (TITULO.test(cAntes) || !comecaPorObjeto(cAntes, extra) || !depois);
        if (rotulo) {
          titulo(antes);
          if (letras(depois) < 3) {
            fora(frase, antes);
            continue;
          }
          pendente = antes + ":";
          frase = depois;
        }
      } else if (ehTitulo(frase)) {
        titulo(frase);
        fora(frase);
        continue;
      }

      // "Os alunos deverão trazer caderno, lápis e borracha": o recado sai, a lista fica.
      const intro = INTRODUTOR.exec(chave(frase));
      if (intro) {
        const corte = intro.index + intro[0].length;
        const depois = frase.slice(corte).replace(/^[\s:,–—-]+/, "");
        if (letras(depois) >= 3) {
          pendente = [pendente, frase.slice(0, corte).trim()].filter(Boolean).join(" ");
          frase = depois;
        }
      }

      // Cada pedaço vira item ou texto; texto vizinho volta a ser uma frase só.
      // Depois de um pedaço de texto, o que vem sem quantidade é continuação
      // dele: em "devem ser encapados e etiquetados com nome", "etiquetados"
      // não é a etiqueta que se compra.
      let textoAberto: LinhaDaEscola | null = null;
      for (const p of dividirLista(frase, extra)) {
        const { quantidade, descricao, observacao } = lerTrecho(p.texto);
        if (letras(descricao) < 3) continue;
        const item = pareceItem(descricao, quantidade, secao, extra) && !(textoAberto && quantidade === null);
        if (item) {
          if (pendente) fora(pendente, pendente.replace(/:$/, ""));
          pendente = null;
          out.push({ original: p.texto, quantidade: Math.min(99, quantidade ?? 1), descricao, observacao, item: true });
          textoAberto = null;
        } else if (textoAberto) {
          textoAberto.original += p.sep.trimEnd() + " " + p.texto;
          textoAberto.descricao = textoAberto.original;
        } else {
          const original = pendente ? `${pendente} ${p.texto}` : p.texto;
          pendente = null;
          textoAberto = { original, quantidade: Math.min(99, quantidade ?? 1), descricao, observacao, item: false };
          out.push(textoAberto);
        }
      }
      if (pendente) fora(pendente, pendente.replace(/:$/, ""));
    }
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
  "escolar", "nome", "aproximadamente",
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
 * Nota de 0 a 1 entre a linha e um produto. Metade é a semelhança entre os
 * dois, metade é quanto de UM cabe no OUTRO: a escola ora escreve mais que o
 * catálogo ("tesoura escolar sem ponta com nome" é a "Tesoura sem ponta"),
 * ora menos ("borracha" é a "Borracha branca"), e só a semelhança puniria
 * os dois casos. Quando "menos" casa com vários produtos ("cola" × bastão e
 * branca), quem desempata é a papelaria: ver `emDuvida`.
 *
 * A primeira palavra é o "o que é" (lápis, caderno, cola): sem ela em comum,
 * a nota cai pela metade, para "cola colorida" não ganhar de "cola bastão"
 * só por causa de "colorida".
 */
function nota(linha: string[], produto: string[]): number {
  if (!linha.length || !produto.length) return 0;
  const l = new Set(linha);
  const p = new Set(produto);
  const comum = [...l].filter((x) => p.has(x));
  if (!comum.length) return 0;
  let n = ((2 * comum.length) / (l.size + p.size) + comum.length / Math.min(l.size, p.size)) / 2;
  if (!l.has(produto[0]) && !p.has(linha[0])) n /= 2;
  // Número que a linha tem e o produto contradiz (24 cores × 12 cores) pesa contra.
  const numL = linha.filter((x) => /^\d+$/.test(x));
  const numP = produto.filter((x) => /^\d+$/.test(x));
  if (numL.length && numP.length && !numL.some((x) => p.has(x))) n *= 0.6;
  return n;
}

/** Nota mínima para sugerir um produto; abaixo dela a linha começa como indisponível. */
export const NOTA_MINIMA = 0.4;
/** Abaixo desta nota a sugestão aparece como "Confira". */
export const NOTA_SEGURA = 0.6;

/**
 * A melhor sugestão pede conferência? Nota baixa, ou um segundo produto quase
 * empatado: "cola" casa igual com "Cola bastão" e "Cola branca", e escolher
 * um dos dois pela papelaria seria adivinhar.
 */
export function emDuvida(sugestoes: Sugestao[]): boolean {
  const [a, b] = sugestoes;
  return !a || a.pontos < NOTA_SEGURA || (!!b && a.pontos - b.pontos < 0.1);
}

/** Prepara o catálogo uma vez e devolve quem sugere, para não refazer as palavras de cada produto a cada linha. */
export function sugeridor(produtos: ProdutoParaCasar[]): (descricao: string) => Sugestao[] {
  const preparados = produtos.map((p) => ({ ...p, palavras: palavras(p.nome) }));
  return (descricao) => {
    const l = palavras(descricao);
    return preparados
      .map((p) => ({ produto_id: p.id, nome: p.nome, pontos: Math.round(nota(l, p.palavras) * 100) / 100 }))
      .filter((s) => s.pontos > 0)
      .sort((a, b) => b.pontos - a.pontos || a.nome.localeCompare(b.nome))
      .slice(0, 3);
  };
}

/** Os até 3 produtos mais parecidos com a linha, do melhor para o pior. */
export function sugerir(descricao: string, produtos: ProdutoParaCasar[]): Sugestao[] {
  return sugeridor(produtos)(descricao);
}

/** As palavras que abrem os nomes do catálogo ("caderno", "lápis"): o que a loja vende é material escolar. */
export function vocabularioDoCatalogo(produtos: ProdutoParaCasar[]): string[] {
  return [...new Set(produtos.map((p) => palavras(p.nome)[0]).filter((w): w is string => !!w && /^[a-z]{3,}$/.test(w)))];
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
