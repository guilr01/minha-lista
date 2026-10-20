// A lista que a escola manda (PDF, Word, Excel ou texto colado), lida trecho a
// trecho e comparada com o catálogo da papelaria. Puro de propósito: sem
// banco e sem arquivo, para o teste alcançar cada regra. Quem lê o arquivo é
// src/lib/arquivo-de-lista.ts; quem grava é a ação da tela de importar.
//
// A comparação SUGERE, não decide: a papelaria confere linha a linha antes
// de qualquer item entrar na lista.

/** Por que um trecho ficou fora da lista de material. */
export type MotivoFora = "livro" | "escola" | "texto";

export type LinhaDaEscola = {
  /** O trecho como veio, para a papelaria reconhecer. */
  original: string;
  quantidade: number;
  /** O que sobra tirando quantidade, marcadores, preço e instrução: "lápis de cor 24 cores". */
  descricao: string;
  /** O que a escola pôs entre parênteses ou como instrução: "capa dura", "colocar o nome". */
  observacao: string;
  /**
   * É item da lista de material? Livro, item que se compra na própria
   * escola, título, recado, data e contato vêm com false: ficam fora da
   * conferência, num bloco à parte, e a papelaria traz de volta o que for item.
   */
  item: boolean;
  /** Só quando `item` é false. */
  motivo?: MotivoFora;
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
// material deverá ser etiquetado" tem a cara de uma linha de lista, e
// "Capitães de areia" tem a cara de um item sem quantidade. O que decide é o
// conjunto: tem quantidade? começa por um objeto que se compra em papelaria?
// fala como recado? é livro (título seguido de Autor/Editora/ISBN, "Livro:",
// seção "LIVROS")? a escola vende? em que seção está?
//
// As regras saíram de listas reais de quatro escolas (20/10/2026): planilha
// de papelaria com colunas de valor, lista por disciplina com bloco de livro,
// lista com instrução colada em cada item e lista de colégio com "Livro:".
// O vocabulário abaixo soma-se às palavras do catálogo da própria loja.

const OBJETO_INTEIRO = new Set([
  "giz", "cera", "cola", "eva", "tnt", "cd", "dvd", "clip", "clips", "durex", "guache", "pote", "copo", "prato", "kit",
  "foto", "refil", "isopor", "massa", "lixa", "tela", "fone", "lupa", "regua", "etiqueta", "mala", "jaleco", "planner",
  // Inteiras, não prefixo: "papel" casaria com "papelaria", "agenda" com "agendamento".
  "papel", "papeis", "agenda",
]);
// Livro, dicionário e apostila NÃO estão aqui de propósito: são livros, e livro não entra na lista.
const OBJETO_PREFIXO = [
  "cadern", "lapis", "borrach", "apontad", "tesour", "estoj", "mochil", "lancheir", "canet", "hidrocor",
  "hidrograf", "marcador", "marcatexto", "tinta", "pincel", "pincei", "sulfite", "cartolin", "crepom",
  "colorset", "feltro", "massinh", "argila", "pasta", "envelop", "fichari", "bloco", "fita", "barbant", "glitter",
  "gliter", "purpurin", "lantejoul", "palito", "prendedor", "pregador", "grampead", "clipe", "corretiv", "compasso",
  "transferidor", "esquadro", "calculador", "flauta", "avental", "toalh", "garraf", "squeeze", "escov", "creme",
  "sabonet", "lenco", "jogo", "quebra", "brinquedo", "revist", "gibi", "caderneta", "plastic", "contact", "adesiv",
  "autoadesiv", "carimbo", "almofad", "prancheta", "pendrive", "novelo", "botao", "botoe", "micang", "alfinet",
  "percevejo", "elastic", "bastao", "grafite", "tecido", "saquinh", "sacola", "flanela", "esponj", "pratinh",
  "guardanap", "tampinh", "cordao", "papelao", "pistola", "caneca", "mapa", "globo", "dado", "jalec", "necessaire",
  "acetato", "tangram", "trangram", "lapiseir",
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
const FRASE = new RegExp(String.raw`\b(?:devem?|devera|deverao|devendo|sera|serao|seja|sejam|favor|solicit\w*|pedimos|lembr\w*|podera|poderao|pode|podem|precisam|precisarao|possuem|possui|ficara|ficarao|permanec\w*|sugerimos|recomend\w*|informamos|comunicamos|seguiremos|contamos|havendo|apoiamos|estabelec\w*|fara|farao|reuniao|inicio|horario|matricula|mensalidade|calendario|letivo|bimestre|semestre|trimestre|nome do aluno|todos?|todas?|cada)\b`);
/** Fala da escola, não do objeto: só pesa quando o trecho não começa por um objeto. */
const CONTEXTO = new RegExp(String.raw`\b(?:entreg\w*|utiliz\w*|identific\w*|etiquetad\w*|encapad\w*|marcad[oa]s?|vendid\w*|comprad\w*|adquirid\w*|devolv\w*|retirad\w*|guardad\w*|obrigatori\w*|importante|atencao|observac\w*|obs|secretaria|coordenac\w*|diretoria|responsave\w*|durante|conforme|necessidade|reposic\w*|uniforme|escola|colegio|alunos?|estudantes?|familias?|criancas?|turma|prof|professor\w*|ensino|fundamental|infantil|aulas?|semana|pais|sala|cobranca|taxa|disciplinas?|eletivas?)\b`);
const DATA = /\b\d{1,2}\/\d{1,2}\b|\b\d{1,2}h(?:\d{2})?\b|\b\d{1,2}:\d{2}\b|\b(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b/;
const CONTATO = /@|www\.|https?:|\btel\b|\bfone\b|telefone|whatsapp|e-?mail|\bcep\b|\bcnpj\b|\brua\b|\bavenida\b|\bav\.|\(\d{2}\)\s*\d|\d{4,5}-\d{4}/;

/** Título de seção: "Material de uso individual", "LIVROS", "Observações". */
const TITULO = /^(?:lista\b.*|materia(?:l|is)\b.*|livros?(?: (?:de )?(?:didaticos?|paradidaticos?|literatura|leitura))?|paradidaticos?|literatura|leitura|itens\b.*|uso (?:individual|coletivo|pessoal)\b.*|para uso\b.*|observac\w*.*|informac\w*.*|importante\b.*|atencao\b.*|recados?\b.*|avisos?\b.*|uniforme\b.*|obs)$/;
/** Lista organizada por disciplina: o nome da disciplina sozinho na linha é título, não item. */
const DISCIPLINA = /^(?:area de .*|lingua (?:portuguesa|inglesa|espanhola|estrangeira)\b.*|portugues|matematica|historia|geografia|ciencias(?: (?:da natureza|humanas|naturais))?|ingles|espanhol|frances|artes?|educacao fisica|musica|biologia|fisica|quimica|filosofia|sociologia|redacao|tutoria|ensino religioso|cultura religiosa.*|projeto de vida|robotica|tecnologia|informatica|programa bilingue|bilingue)$/;
const SECAO_TEXTO = /observ|informac|importante|atenc|recado|aviso|uniforme|reuniao|horario|calendario|\bobs\b/;
const SECAO_LIVRO = /\blivros?\b|paradidatic|didatic|literatura|leitura/;

// ------------------------------------------------------------------- livros
//
// Livro NÃO entra na lista de material (decisão do Guilherme, 20/10/2026): a
// papelaria não vende, e "indisponível" no recado faria o cliente achar que
// devia. Livro aparece de três jeitos nas listas reais, e os três contam:
//   "Livro: Extraordinário" · "Dicionário ilustrado" (começa por livro)
//   "Capitães de areia" / "Autor: …" / "Editora: …" / "ISBN: …" (o bloco)
//   tudo debaixo de "LIVROS", "Paradidáticos", "Literatura"

/** Linha de ficha de livro: "Autor: …", "Editora: …", "ISBN: …", "Coleção Master", "Ed. FTD". */
const LIVRO_FICHA = /^(?:autor(?:a|es|as)?|editora|isbn|colecao|edicao|ed\.|volume|vol\.|traducao|ilustrac\w*|organizac\w*|org\.)(?=[\s:.]|$)/;
/** Começa por livro: dicionário, atlas, apostila, gramática e sistema de ensino também são livro. */
const LIVRO_INICIO = /^(?:livros?|dicionarios?|minidicionarios?|atlas|apostilas?|gramaticas?|paradidaticos?|sistema de ensino|obras?)\b/;
const LIVRO_DENTRO = /\b(?:editora|isbn)\b|\b\d+[ªa]\s*edicao\b|\bed\.\s*[a-z]|\b97[89][\d-]{10,}/;
/** Editora no fim do trecho, depois de travessão, barra ou parêntese: "Ápis 1º ano – Ática". */
const LIVRO_EDITORA = /(?:^|[-–—(/,]\s*)(?:ed\.?\s*)?(?:moderna|ftd|atica|scipione|saraiva|positivo|salamandra|rocco|intrinseca|melhoramentos|ibep|harbra|cengage|oxford|pearson|richmond|macmillan|cambridge|companhia das letr\w+|nova fronteira|brinque-book|editora do brasil|sextante|paulus|panda books|global|zahar|todavia)\s*\)?\s*$/;

/** A própria escola vende ou fornece: o cliente não compra na papelaria. */
const ESCOLA = /\b(?:adquirid[oa]s?|vendid[oa]s?|fornecid[oa]s?|comprad[oa]s?|disponive(?:l|is)|a venda)\s+(?:no|na|pelo|pela|em)\s+(?:propri[oa]\s+)?(?:colegio|escola|secretaria|cantina)\b|\b(?:colegio|escola)\s+(?:fornece|vende|disponibiliza)\b/;

/** O verbo que abre uma lista em texto corrido: tudo antes dele é recado. */
const INTRODUTOR = /\b(?:trazer|tragam?|providenciar|adquirir|comprar|enviar|solicitamos|pedimos|recomendamos|sugerimos|necessarios?|precisar(?:a|ao)? de|composto por|compost[oa]s? de|sao eles|a seguir|seguintes?(?: materiais| itens)?)\b\s*:?/;

/** Instrução que a escola cola no item: vai para a observação, não para a descrição. */
const INSTRUCAO = /^(?:colocar|coloque|etiquet\w*|identific\w*|devidamente|com (?:o )?nome|de livre escolha|livre escolha|sugest\w*|marca sugerida|ou similar|ou outra marca|para (?:ser|serem|uso|os|as|o|a|guardar|beber|arquivar)\b|nao (?:sera|e) permitid\w*)/;
const RABO_DE_INSTRUCAO = /\s+(?:para (?:ser|serem|uso|os|as|o|a|guardar|beber|arquivar)\b|com (?:o )?nome\b|etiquetad\w*|identificad\w*|devidamente\b|de livre escolha|ou similar\b|ou outra marca\b)/;

const UNIDADE_NAO_PRECO = String.raw`\s*(?:cm|mm|m|ml|l|kg|g|mg|litros?|metros?|folhas?|fls|cores)\b`;
const PRECO = new RegExp(String.raw`R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|(?<![\w.,/])\d+(?:[.,]\d{1,2}|\.\d{3,})(?:\s*\/\s*\d+[.,]\d{1,2})*(?![\w.,/]|${UNIDADE_NAO_PRECO})`, "gi");
// Marcadores de lista, inclusive os da fonte Symbol que o PDF entrega como caractere privado.
// "( ) 2 cadernos", "[ ] 2 cadernos", "☐ 2 cadernos": a caixinha de marcar também é marcador.
const MARCADOR = /^(?:[-–—•*·▪●◦>➢►✓✔❖◆■□○☐☑☒❑]+\s*|\(\s*\)\s*|\[\s*[xX]?\s*\]\s*|[a-z][).]\s+)/i;

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

/** Algum objeto entre as primeiras palavras ("novo caderno" sim; "uso de tênis" não). */
function temObjeto(c: string, extra: Vocabulario): boolean {
  return comecaPorObjeto(c, extra) || termos(c).filter((w) => !/^\d+$/.test(w)).slice(0, 4).some((w) => ehObjeto(w, extra));
}

/** Depois de uma vírgula, um "e" ou um "contendo", começa um item novo, ou é a continuação do anterior ("capa dura", "96 folhas")? */
function iniciaItem(trecho: string, extra: Vocabulario): boolean {
  const c = chave(trecho.trim()).replace(MARCADOR, "");
  // "em papel", "de plástico", "com zíper": começar por preposição é continuar o item de antes.
  if (/^(?:em|de|da|do|das|dos|com|para|sem|no|na|nos|nas|por|ao|aos)\s/.test(c)) return false;
  const num = c.match(/^(\d{1,3})\s*([a-z]*)/);
  if (num) {
    if (!num[2] || MEDIDA.test(num[2])) return false;
    if (/^(?:folhas?|fls)$/.test(num[2]) && Number(num[1]) >= 20) return false;
    return true;
  }
  const escrito = c.match(/^([a-z]+)\s/);
  if (escrito && NUMEROS_ESCRITOS[escrito[1]] && comecaPorObjeto(c.slice(escrito[0].length), extra)) return true;
  return comecaPorObjeto(c, extra);
}

/**
 * Quebra uma frase em itens por vírgula, ponto e vírgula, dois-pontos, "e" e
 * "contendo", fora dos parênteses, juntando de volta o que é continuação.
 * "1 estojo contendo lápis, borracha e cola" são quatro itens; "2 cadernos,
 * capa dura, 96 folhas" e "massinha nas cores: azul, amarela" são um.
 */
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
      const resto = frase.slice(i, i + 10);
      if (ch === ";" || (ch === "," && !(/\d/.test(frase[i - 1] ?? "") && /\d/.test(frase[i + 1] ?? "")))) corte = ch;
      else if (ch === ":" && !/\d/.test(frase[i + 1] ?? "")) corte = ch;
      else if (/^ e /i.test(resto)) corte = " e ";
      else if (/^ contendo /i.test(resto)) corte = " contendo ";
    }
    if (!corte) { atual += ch; continue; }
    pedacos.push({ sep, texto: atual });
    sep = corte.length === 1 ? corte + " " : corte;
    atual = "";
    i += corte.length - 1;
  }
  pedacos.push({ sep, texto: atual });

  const out: { sep: string; texto: string }[] = [];
  for (const p of pedacos) {
    const texto = p.texto.trim();
    if (!texto) continue;
    if (out.length && !iniciaItem(texto, extra)) out[out.length - 1].texto += p.sep + texto;
    else out.push({ sep: p.sep, texto });
  }
  return out;
}

type Trecho = { quantidade: number | null; escrita: boolean; descricao: string; observacao: string };

/** Quantidade, descrição e observação de um trecho que pode ser item. */
function lerTrecho(trecho: string): Trecho {
  let resto = trecho.replace(MARCADOR, "");
  let quantidade: number | null = null;
  let escrita = false;

  // "1. 2 lápis" é numeração seguida de quantidade; "1. lápis" ou "01 lápis" é quantidade.
  const numeracao = resto.match(/^\d{1,2}[.)]\s+(?=\d)/);
  if (numeracao) resto = resto.slice(numeracao[0].length);
  // Não é quantidade: "1º ano", "1o. Ano", "30/01", "10:30", "96 folhas", "24 cores".
  const inicio = resto.match(/^(\d{1,3})(?!\d)(?![ºª°]|[oa]\b)(?!\s*[/,.:]\s*\d)\s*(?:x\b|un\b\.?|und\b\.?|unid\w*\.?|pcts?\b\.?|cx\b\.?|[-–—.):])?\s*/i);
  if (inicio && Number(inicio[1]) > 0) {
    const depois = chave(resto.slice(inicio[0].length));
    const medida = MEDIDA.test(depois) || (/^(?:folhas?|fls)\b/.test(depois) && Number(inicio[1]) >= 20);
    if (!medida) {
      quantidade = Number(inicio[1]);
      resto = resto.slice(inicio[0].length);
    }
  } else {
    const nome = chave(resto).match(/^(\p{L}+)\s+/u);
    if (nome && NUMEROS_ESCRITOS[nome[1]]) {
      quantidade = NUMEROS_ESCRITOS[nome[1]];
      escrita = true;
      resto = resto.slice(nome[0].length);
    }
  }
  // "02 (dois) cadernos": o número por extenso entre parênteses não é observação.
  const extenso = resto.match(/^\(\s*([^)]*?)\s*\)\s*/);
  if (extenso && NUMEROS_ESCRITOS[chave(extenso[1])]) resto = resto.slice(extenso[0].length);
  // "Qtd: 2" / "Quant. 2" em qualquer ponto da linha.
  if (quantidade === null) {
    const qtd = resto.match(/[\s(,–—-]*\b(?:qtd|qtde|quant)\.?\s*:?\s*(\d{1,3})\b\)?/i);
    if (qtd && Number(qtd[1]) > 0) {
      quantidade = Number(qtd[1]);
      resto = resto.slice(0, qtd.index) + resto.slice(qtd.index! + qtd[0].length);
    }
  }
  // No fim: "lápis - 2 unidades", "cola (2)", "borracha x2", "Caderno ........ 2".
  if (quantidade === null) {
    const fim = resto.match(/\s*(?:[-–—:,]\s*|\(\s*|\bx\s*|\.{2,}\s*|…+\s*)(\d{1,3})\s*(?:un\w*|und\.?|p[çc]s?|pacotes?|caixas?)?\s*\)?\s*\.?$/i);
    if (fim && Number(fim[1]) > 0) {
      quantidade = Number(fim[1]);
      resto = resto.slice(0, fim.index);
    }
  }

  const obs = [...resto.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  let descricao = resto.replace(/\([^)]*\)/g, " ").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();

  // Instrução colada no item ("- colocar o nome completo", ", devidamente
  // identificada", "para ser utilizado nas aulas") vai para a observação: o
  // cliente lê, e a comparação com o catálogo não tropeça nela.
  const partes = descricao.split(/(\s+[-–—]\s+|,\s+|;\s*)/);
  let fica = partes[0];
  for (let i = 1; i < partes.length; i += 2) {
    const seg = partes[i + 1]?.trim() ?? "";
    if (!seg) continue;
    const c = chave(seg);
    if (INSTRUCAO.test(c) || FRASE.test(c) || CONTEXTO.test(c) || DATA.test(c)) obs.push(seg);
    else fica += partes[i] + seg;
  }
  const rabo = chave(fica).search(RABO_DE_INSTRUCAO);
  if (rabo > 0) {
    obs.push(fica.slice(rabo).trim());
    fica = fica.slice(0, rabo);
  }
  descricao = fica.replace(/(?:\s+(?:com|de|e|ou|contendo|para))+\s*$/i, "")
    .replace(/[\s.,;:–—-]+$/, "").replace(/^[\s.,;:–—-]+/, "").replace(/\s+/g, " ").trim();
  const observacao = obs.map((o) => o.replace(/^[\s.,;:–—-]+|[\s.,;:–—-]+$/g, "")).filter(Boolean).join("; ").replace(/\s+/g, " ");
  return { quantidade, escrita, descricao: descricao.replace(/\s*\.{2,}\s*$/, ""), observacao: observacao.slice(0, 120) };
}

type Secao = "lista" | "texto" | "livro";

/** A decisão: item ou não. */
function pareceItem({ descricao, quantidade, escrita, observacao }: Trecho, extra: Vocabulario): boolean {
  const c = chave(descricao);
  const frase = FRASE.test(c) || DATA.test(c) || CONTATO.test(c);
  // Quantidade em algarismo é o sinal mais forte de item: só perde para o recado sem objeto nenhum.
  if (quantidade !== null && !escrita) return temObjeto(c, extra) || !(frase || CONTEXTO.test(c));
  // Sem quantidade (ou "uma" por extenso, que é palavra comum em frase), só o que COMEÇA por um objeto,
  // e o recado conta INTEIRO: em "Cadernos: são de livre escolha e poderão…", o "poderão" foi para a observação.
  return !frase && !FRASE.test(chave(observacao)) && contarPalavras(descricao) <= 10 && comecaPorObjeto(c, extra);
}

/** Livro, ou comprado na própria escola? */
function motivoFora(t: Trecho, secao: Secao, extra: Vocabulario): MotivoFora | null {
  const c = chave(t.descricao);
  const tudo = chave(`${t.descricao} ${t.observacao}`);
  if (LIVRO_INICIO.test(c) || LIVRO_DENTRO.test(tudo) || LIVRO_EDITORA.test(c) || LIVRO_EDITORA.test(chave(t.observacao))) return "livro";
  if (ESCOLA.test(tudo)) return "escola";
  // Debaixo de "LIVROS", só sai item o que tem quantidade E é objeto ("1 caderno").
  if (secao === "livro" && !(t.quantidade !== null && !t.escrita && temObjeto(c, extra))) return "livro";
  return null;
}

/**
 * O PDF quebra a frase no fim da linha do papel: "…lápis, borracha e uma" /
 * "caixa de giz de cera." Junta a linha à seguinte quando ela claramente
 * continua: termina em vírgula ou em palavra de ligação, é frase de recado,
 * tem parêntese aberto, ou a seguinte é um resto curto ("marca"). Lista em
 * minúsculas sem marcador não junta: "caderno brochura" / "lápis preto" são
 * dois itens, e linha com marcador nunca é continuação.
 */
function juntarQuebras(linhas: string[]): string[] {
  const out: string[] = [];
  for (const bruta of linhas) {
    const l = bruta.trim();
    const ant = out.length ? out[out.length - 1] : "";
    if (!ant || !l || MARCADOR.test(l)) { out.push(l); continue; }
    const c = chave(ant);
    const termina = /[.;:!?]$/.test(ant);
    const ligacao = /\b(?:e|de|da|do|das|dos|com|um|uma|os|as|o|a|que|para|na|no|em|ou|cada)$/.test(c);
    const minuscula = /^\p{Ll}/u.test(l);
    const continua =
      (minuscula && (/[,]$/.test(ant) || ligacao)) ||
      (minuscula && !termina && contarPalavras(ant) >= 6 && (FRASE.test(c) || CONTEXTO.test(c))) ||
      (minuscula && !termina && contarPalavras(ant) >= 6 && contarPalavras(l) <= 2) ||
      ((ant.match(/\(/g)?.length ?? 0) > (ant.match(/\)/g)?.length ?? 0)) ||
      // Ficha de livro quebrada: "Autores: Igor Machado," / "Henrique Amorim e Celso Barros".
      (/,$/.test(ant) && LIVRO_FICHA.test(c)) ||
      // Título em maiúsculas quebrado: "LÍNGUA PORTUGUESA, PRODUÇÃO TEXTUAL, LITERATURA E" / "ARTE".
      (ligacao && ant === ant.toUpperCase() && l === l.toUpperCase() && letras(l) >= 3);
    if (continua) out[out.length - 1] = `${ant} ${l}`;
    else out.push(l);
  }
  return out;
}

/**
 * Linha com colunas separadas por tabulação (colada do Excel, ou CSV): o
 * número solto depois da descrição é preço, a quantidade depois do nome vai
 * para a frente ("Caderno brochura ⇥ 2 ⇥ 13,90" → "2 Caderno brochura").
 */
function linhaDeColunas(linha: string): string {
  if (!linha.includes("\t")) return linha;
  const cels = linha.split("\t").map((c) => c.trim()).filter(Boolean);
  const numero = (t: string) => /^(?:R\$\s*)?\d+(?:[.,]\d+)?$/i.test(t);
  if (!cels.length) return "";
  if (numero(cels[0])) return [cels[0], ...cels.slice(1).filter((t) => !numero(t))].join(" ");
  const qtd = cels.find((t, i) => i > 0 && /^\d{1,2}$/.test(t));
  return [qtd, ...cels.filter((t) => !numero(t))].filter(Boolean).join(" ");
}

/** Dois-pontos fora de parênteses e que não é hora (10:30). */
function doisPontos(frase: string): number {
  let fundo = 0;
  for (let i = 0; i < frase.length; i++) {
    const ch = frase[i];
    if (ch === "(") fundo++;
    else if (ch === ")") fundo = Math.max(0, fundo - 1);
    else if (ch === ":" && fundo === 0 && !/\d/.test(frase[i + 1] ?? "")) return i;
  }
  return -1;
}

/**
 * Lê o texto da escola e devolve os trechos, cada um marcado como item ou
 * não (com o motivo). `vocabulario` são as palavras que abrem os nomes do
 * catálogo da loja: o que ela vende é, por definição, material escolar.
 */
export function lerLinhas(texto: string, opcoes: { vocabulario?: Iterable<string> } = {}): LinhaDaEscola[] {
  const doCatalogo = new Set([...(opcoes.vocabulario ?? [])].map(chave).filter((w) => /^[a-z]{3,}$/.test(w)));
  const extra: Vocabulario = { tem: (w) => doCatalogo.has(w) };
  const out: LinhaDaEscola[] = [];
  /** Títulos de seção de verdade ("LIVROS", "Matemática"): a busca do título de um livro para neles. */
  const titulos = new Set<LinhaDaEscola>();
  let secao = "lista" as Secao;
  let vazias = 0;

  const fora = (original: string, motivo: MotivoFora = "texto", descricao = original) => {
    if (letras(descricao) < 3) return null;
    const l: LinhaDaEscola = { original: original.trim(), quantidade: 1, descricao: descricao.trim(), observacao: "", item: false, motivo };
    out.push(l);
    return l;
  };
  // Título de seção é a linha INTEIRA casando com a lista de títulos: "Este
  // livro contém coelhos" tem "livro" e é título de livro, não de seção.
  const tituloForte = (t: string) => {
    const c = chave(t).replace(/[\s:!.]+$/, "");
    return TITULO.test(c) || DISCIPLINA.test(c);
  };
  const novaSecao = (t: string) => {
    const c = chave(t);
    secao = SECAO_TEXTO.test(c) ? "texto" : SECAO_LIVRO.test(c) ? "livro" : "lista";
  };
  const ehTitulo = (bruto: string) => {
    // "MATERIAL DE USO COLETIVO (entregar na primeira semana)": o parêntese não conta.
    const t = bruto.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (lerTrecho(t).quantidade !== null) return false;
    if (contarPalavras(t) <= 6 && tituloForte(t)) return true;
    const so = t.replace(/[^\p{L}]/gu, "");
    return so.length >= 4 && so === so.toUpperCase() && contarPalavras(t) <= 10 && !comecaPorObjeto(chave(t), extra);
  };
  /**
   * Ficha de livro ("Autor: …"): o título vem logo antes, sem marca nenhuma
   * de livro. Marca até duas linhas acima (título e subtítulo, ou "1º
   * semestre" e título), parando em item, em título de seção e em linha que
   * fala como recado: a frase do calendário logo acima de "A visão das
   * plantas" não é livro.
   */
  const marcarTituloDoLivro = () => {
    let marcadas = 0;
    for (let j = out.length - 1; j >= 0 && marcadas < 2; j--) {
      const l = out[j];
      const c = chave(l.original);
      if (l.item || titulos.has(l) || contarPalavras(l.original) > 10 || FRASE.test(c) || CONTEXTO.test(c)) break;
      l.motivo = "livro";
      marcadas++;
    }
  };

  const linhas = texto.normalize("NFC").replace(/\r/g, "").replace(/[\uE000-\uF8FF]/g, "•")
    // "do(a) aluno(a)", "O(A)": gênero e plural entre parênteses não são observação.
    .replace(/\((?:a|as|o|os|s|es)\)/gi, "")
    .split("\n")
    .map(linhaDeColunas);

  for (const bruta of juntarQuebras(linhas)) {
    const linha = bruta.replace(/\s+/g, " ").replace(PRECO, " ").replace(/\s+/g, " ").replace(/[\s–—-]+$/, "").trim();
    if (!linha) {
      // Duas linhas em branco seguidas encerram a seção: na planilha, a lista de livros acaba no vão antes da etiqueta.
      if (++vazias >= 2) secao = "lista";
      continue;
    }
    vazias = 0;
    if (letras(linha) < 3) continue;

    // Frases e marcadores no meio da linha. "1." sozinho é numeração e volta a colar no que vem depois.
    const frases: string[] = [];
    for (const f of linha.split(/\s+[•▪●◦➢►✓✔❖◆■]\s*|(?<=(?:\p{L}{3}|\d|\))[.!?])(?<!\b(?:fls|pct|und|unid|aprox|ref|pag|sra|prof|dra)\.)\s+(?=[\p{Lu}\d])/u)) {
      if (frases.length && /^\d{1,3}[.)]$/.test(frases[frases.length - 1])) frases[frases.length - 1] += " " + f;
      else frases.push(f);
    }

    for (const bruta of frases) {
      let frase = bruta.replace(MARCADOR, "").trim();
      if (letras(frase) < 3) continue;

      if (LIVRO_FICHA.test(chave(frase))) {
        marcarTituloDoLivro();
        // A ficha gruda no livro de cima: "Extraordinário · Autor: … · Editora: … · ISBN: …" é UM livro.
        const livro = out[out.length - 1];
        if (livro && livro.motivo === "livro" && !titulos.has(livro)) livro.original += ` · ${frase}`;
        else fora(frase, "livro");
        continue;
      }
      // Endereço, telefone, e-mail e site: a frase inteira é contato, antes de dividir na vírgula.
      if (CONTATO.test(chave(frase))) {
        fora(frase);
        continue;
      }

      // Rótulo ou recado que abre a frase: gruda no trecho que vem logo depois
      // ("Reunião de pais: 30/01 às 19h" é UM aviso), ou sai sozinho antes do item.
      let pendente: string | null = null;
      const dp = doisPontos(frase);
      if (dp >= 0) {
        const antes = frase.slice(0, dp).trim();
        const depois = frase.slice(dp + 1).trim();
        const cAntes = chave(antes);
        const rotulo = contarPalavras(antes) <= 8 && lerTrecho(antes).quantidade === null
          && (tituloForte(antes) || !comecaPorObjeto(cAntes, extra) || !depois);
        if (rotulo) {
          // Só rótulo que é título muda a seção: "Quanto lixo: desperdício…" é o nome de um livro.
          if (tituloForte(antes)) novaSecao(antes);
          if (letras(depois) < 3) {
            const l = fora(frase, secao === "livro" ? "livro" : "texto", antes);
            if (l && tituloForte(antes)) titulos.add(l);
            continue;
          }
          pendente = antes + ":";
          frase = depois;
        }
      } else if (ehTitulo(frase)) {
        novaSecao(frase);
        const l = fora(frase);
        if (l && tituloForte(frase)) titulos.add(l);
        continue;
      }

      // Debaixo de "Importante" e "Observações" não se garimpa item em parágrafo:
      // "Trazer num saco plástico uma camiseta, um par de meia…" é recado. Só
      // passa linha curta com quantidade e objeto ("2 fotos 3x4").
      if (secao === "texto") {
        const t = lerTrecho(frase);
        const c = chave(frase);
        // "2. Trazer dentro de um saco plástico…" é parágrafo numerado: o 2 não é quantidade.
        const numerado = /^\d{1,2}[.)]\s+\p{Lu}/u.test(frase);
        const item = t.quantidade !== null && !t.escrita && !numerado && contarPalavras(frase) <= 12
          && !FRASE.test(c) && !CONTEXTO.test(c) && !INTRODUTOR.test(c) && temObjeto(chave(t.descricao), extra);
        if (item) {
          if (pendente) fora(pendente);
          out.push({ original: frase, quantidade: Math.min(99, t.quantidade!), descricao: t.descricao, observacao: t.observacao, item: true });
        } else {
          fora(pendente ? `${pendente} ${frase}` : frase);
        }
        continue;
      }

      // "Os alunos deverão trazer caderno, lápis e borracha": o recado sai, a
      // lista fica. Só corta se depois do verbo houver objeto: "não precisarão
      // adquirir um novo" é recado inteiro.
      const intro = INTRODUTOR.exec(chave(frase));
      if (intro) {
        const corte = intro.index + intro[0].length;
        const depois = frase.slice(corte).replace(/^[\s:,–—-]+/, "");
        if (letras(depois) >= 3 && termos(chave(depois)).some((w) => ehObjeto(w, extra))) {
          pendente = [pendente, frase.slice(0, corte).trim()].filter(Boolean).join(" ");
          frase = depois;
        }
      }

      // Cada pedaço vira item ou não; vizinhos com o mesmo motivo voltam a ser
      // um trecho só. Depois de um pedaço de texto, o que vem sem quantidade é
      // continuação dele: em "devem ser encapados e etiquetados com nome",
      // "etiquetados" não é a etiqueta que se compra.
      let aberto: LinhaDaEscola | null = null;
      for (const p of dividirLista(frase, extra)) {
        const t = lerTrecho(p.texto);
        if (letras(t.descricao) < 3) continue;
        const motivo = motivoFora(t, secao, extra);
        const item = !motivo && pareceItem(t, extra) && !(aberto && t.quantidade === null);
        if (item) {
          if (pendente) fora(pendente, "texto", pendente.replace(/:$/, ""));
          pendente = null;
          out.push({ original: p.texto, quantidade: Math.min(99, t.quantidade ?? 1), descricao: t.descricao, observacao: t.observacao, item: true });
          aberto = null;
          continue;
        }
        const m = motivo ?? "texto";
        if (aberto && aberto.motivo === m) {
          aberto.original += p.sep.trimEnd() + " " + p.texto;
          aberto.descricao = aberto.original;
          continue;
        }
        const original = pendente ? `${pendente} ${p.texto}` : p.texto;
        pendente = null;
        aberto = { original, quantidade: Math.min(99, t.quantidade ?? 1), descricao: t.descricao, observacao: t.observacao, item: false, motivo: m };
        out.push(aberto);
      }
      if (pendente) fora(pendente, "texto", pendente.replace(/:$/, ""));
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
