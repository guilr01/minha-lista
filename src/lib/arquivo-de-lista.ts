import "server-only";

// Tira o texto do arquivo que a escola mandou. Foto não entra: ler imagem
// exigiria reconhecimento de texto, e a lista em PDF, Word ou mensagem cobre
// o caso comum. O que sai daqui vai para lerLinhas (src/lib/lista-da-escola.ts).

export class ArquivoIlegivel extends Error {}

export const TIPOS_ACEITOS = ".pdf,.docx,.xlsx,.csv,.txt";

const FORMATO_ANTIGO =
  "Este arquivo está no formato antigo do Office (.xls ou .doc). Abra-o e use \"Salvar como\" em .xlsx ou .docx, ou copie o texto da lista e cole no campo ao lado.";

export async function textoDoArquivo(nome: string, dados: ArrayBuffer): Promise<string> {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  // .xls e .doc antigos (formato binário OLE) às vezes chegam renomeados.
  const inicio = new Uint8Array(dados.slice(0, 4));
  if (inicio[0] === 0xd0 && inicio[1] === 0xcf && inicio[2] === 0x11 && inicio[3] === 0xe0) throw new ArquivoIlegivel(FORMATO_ANTIGO);
  try {
    if (ext === "pdf") return await textoDoPdf(dados);
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      return (await mammoth.extractRawText({ buffer: Buffer.from(dados) })).value;
    }
    if (ext === "xlsx") return await textoDaPlanilha(dados);
    if (ext === "xls" || ext === "doc") throw new ArquivoIlegivel(FORMATO_ANTIGO);
    if (ext === "txt" || ext === "csv") {
      const utf8 = new TextDecoder("utf-8").decode(dados);
      // Arquivo salvo no Windows costuma vir em Latin-1: os acentos viram "�".
      const texto = utf8.includes("�") ? new TextDecoder("windows-1252").decode(dados) : utf8;
      // CSV vira colunas por tabulação, que a leitura entende ("Caderno;2;13,90"). Com ponto e
      // vírgula ou tabulação, a vírgula é decimal e fica; só sem eles a vírgula separa coluna.
      if (ext !== "csv") return texto;
      return texto.split("\n").map((l) => (/[;\t]/.test(l) ? l.replace(/;/g, "\t") : l.replace(/,/g, "\t"))).map((l) => l.replace(/"/g, "")).join("\n");
    }
  } catch (e) {
    if (e instanceof ArquivoIlegivel) throw e;
    console.error("[lista da escola] arquivo ilegível", nome, e);
    throw new ArquivoIlegivel("Não consegui ler este arquivo. Se for uma foto ou um PDF escaneado, copie o texto da lista e cole no campo ao lado.");
  }
  throw new ArquivoIlegivel("Envie a lista em PDF, Word (.docx), Excel (.xlsx), CSV ou texto (.txt), ou cole o texto.");
}

async function textoDoPdf(dados: ArrayBuffer): Promise<string> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(dados));
  let texto = "";
  for (let n = 1; n <= pdf.numPages; n++) {
    const conteudo = await (await pdf.getPage(n)).getTextContent();
    // Pedaços da mesma linha separados por espaço em branco no papel (colunas de
    // tabela) ganham um espaço: sem isso "02" e "Caderno" saíam grudados.
    let fimAnterior: number | null = null;
    for (const item of conteudo.items) {
      if (!("str" in item)) continue;
      const x = item.transform[4];
      if (fimAnterior !== null && x - fimAnterior > 1 && !/\s$/.test(texto) && !/^\s/.test(item.str)) texto += " ";
      texto += item.str + (item.hasEOL ? "\n" : "");
      fimAnterior = item.hasEOL ? null : x + item.width;
    }
    texto += "\n";
  }
  if (texto.replace(/\s/g, "").length < 10) {
    throw new ArquivoIlegivel("Este PDF não tem texto (parece uma imagem escaneada). Copie o texto da lista e cole no campo ao lado.");
  }
  return texto;
}

// A planilha é lida direto do XML, e não pelo ExcelJS: ele recusa planilhas
// reais que o Excel abre sem reclamar (logo da escola, célula mesclada,
// formato "Strict", gerada pelo Google Planilhas), e aqui só importa o texto.
// O prefixo opcional de namespace ("x:c") cobre os geradores que o usam.
const tag = (nome: string) => new RegExp(`<(?:\\w+:)?${nome}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:\\w+:)?${nome}>)`, "g");

function decodificar(x: string): string {
  return x
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/_x([0-9a-f]{4})_/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** O texto de um <si> ou <is>: todos os <t>, fora a leitura fonética (<rPh>). */
function textoRico(xml: string): string {
  return [...xml.replace(tag("rPh"), "").matchAll(tag("t"))].map((m) => decodificar(m[2] ?? "")).join("");
}

type Celula = { col: number; texto: string; numero: number | null };

/** "C" → 3, "AA" → 27. */
const coluna = (ref: string) => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
/** Célula que é só número ou preço: "6.9", "13,50/22,90", "R$ 5". */
const SO_NUMERO = /^(?:R\$\s*)?\d+(?:[.,]\d+)?(?:\s*\/\s*(?:R\$\s*)?\d+(?:[.,]\d+)?)*$/i;
const palavrasEm = (s: string) => s.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;

/**
 * A planilha é lida por COLUNA, não pela posição na linha. Lista montada por
 * papelaria tem quantidade · descrição · valor unitário · total, e a seção
 * de livros tem só descrição · valor: lida pela posição, o preço do livro
 * (70) virava a quantidade dele. A coluna de preço se reconhece pelo título
 * ("Valor", "Total", "Preço") ou porque a maioria dos números dela tem
 * centavos; a de quantidade, por só ter inteiros pequenos.
 */
async function textoDaPlanilha(dados: ArrayBuffer): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(dados);
  const comuns = zip.file("xl/sharedStrings.xml");
  const textos = comuns ? [...(await comuns.async("string")).matchAll(tag("si"))].map((m) => textoRico(m[2] ?? "")) : [];
  const abas = zip.file(/^xl\/worksheets\/[^/]+\.xml$/)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!abas.length) throw new Error("planilha sem abas");

  const linhas: string[] = [];
  for (const aba of abas) {
    const xml = await aba.async("string");
    const grade: { numero: number; cels: Celula[] }[] = [];
    for (const row of xml.matchAll(tag("row"))) {
      const cels: Celula[] = [];
      let pos = 0;
      for (const c of (row[2] ?? "").matchAll(tag("c"))) {
        pos++;
        const ref = c[1].match(/\br="([A-Z]+)\d*"/)?.[1];
        const tipo = c[1].match(/\bt="([^"]*)"/)?.[1];
        const corpo = c[2] ?? "";
        const v = corpo.match(tag("v"))?.[0].replace(/<[^>]*>/g, "");
        let t = "";
        if (tipo === "s") t = textos[Number(v)] ?? "";
        else if (tipo === "inlineStr") t = textoRico(corpo);
        else if (tipo !== "e" && tipo !== "b" && v) t = decodificar(v);
        if (!t.trim()) continue;
        const numero = !tipo || tipo === "n" ? Number(v) : null;
        cels.push({ col: ref ? coluna(ref) : pos, texto: t, numero: numero !== null && Number.isFinite(numero) ? numero : null });
      }
      grade.push({ numero: Number(row[1].match(/\br="(\d+)"/)?.[1] ?? grade.length + 1), cels });
    }

    // O papel de cada coluna, olhando a aba inteira.
    const papel = new Map<number, { nums: number; centavos: number; inteiros: number; textos: number; preco: boolean; qtd: boolean }>();
    for (const { cels } of grade) {
      for (const c of cels) {
        const s = papel.get(c.col) ?? { nums: 0, centavos: 0, inteiros: 0, textos: 0, preco: false, qtd: false };
        const t = c.texto.trim();
        const n = c.numero ?? (SO_NUMERO.test(t) ? Number(t.replace(/R\$/i, "").split("/")[0].trim().replace(",", ".")) : null);
        if (n !== null) {
          s.nums++;
          if (!Number.isInteger(n) || /[.,]\d/.test(t)) s.centavos++;
          else if (n >= 1 && n <= 99) s.inteiros++;
        } else {
          s.textos++;
          if (/^(?:valor|pre[cç]o|total|subtotal|r\$|unit)/i.test(t)) s.preco = true;
          if (/^(?:qtd|qtde|quant)/i.test(t)) s.qtd = true;
        }
        papel.set(c.col, s);
      }
    }
    // Coluna de preço é coluna de NÚMEROS: "TOTAL" escrito na coluna das descrições não a transforma em preço.
    const precos = new Set([...papel].filter(([, s]) => s.nums > s.textos && (s.preco || s.centavos / s.nums >= 0.3)).map(([col]) => col));
    const qtdCol = [...papel].filter(([col, s]) => !precos.has(col) && (s.qtd || (s.nums >= 3 && s.inteiros === s.nums && s.nums >= s.textos)))
      .map(([col]) => col).sort((a, b) => a - b)[0];

    let anterior = 0;
    for (const { numero, cels } of grade) {
      // Linha vazia no meio da aba conta: duas seguidas encerram a seção em
      // lerLinhas (a lista de livros acaba no vão antes da etiqueta).
      for (let k = anterior + 1; k < numero && k <= anterior + 2; k++) linhas.push("");
      anterior = numero;
      const qtd = cels.find((c) => c.col === qtdCol && c.numero !== null && Number.isInteger(c.numero) && c.numero > 0);
      // Texto em outra "coluna" dentro da mesma célula, separado por muitos
      // espaços ("caderno de desenho …          Inglês"): cada pedaço conta à parte.
      const partes = cels.filter((c) => c !== qtd && !precos.has(c.col))
        .flatMap((c) => c.texto.split(/\s{4,}/).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean));
      // Número solto depois da descrição é valor sem título de coluna, não texto da lista.
      let texto = partes.filter((t, i) => !(i > 0 && SO_NUMERO.test(t)));
      let quantidade = qtd ? String(qtd.numero) : "";
      // Sem coluna de quantidade reconhecida (planilha curta): número na primeira célula é a
      // quantidade; "Caderno brochura | 2" traz o 2 para a frente.
      if (!quantidade && texto.length > 1 && /^\d{1,3}$/.test(texto[0])) quantidade = texto.shift()!;
      else if (!quantidade && texto.length && !/^\d/.test(texto[0])) {
        const i = partes.findIndex((t, j) => j > 0 && /^\d{1,2}$/.test(t));
        if (i > 0) quantidade = partes[i];
      }
      if (!texto.length) {
        linhas.push("");
        continue;
      }
      const [descricao, ...resto] = texto;
      texto = [quantidade, descricao, ...resto.map((t) => (palavrasEm(t) <= 4 ? `(${t})` : t))].filter(Boolean);
      linhas.push(texto.join(" "));
    }
  }
  return linhas.join("\n");
}
