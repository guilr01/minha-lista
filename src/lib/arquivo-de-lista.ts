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
      return ext === "csv" ? texto.replace(/[;,\t]+/g, " ") : texto;
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
    for (const item of conteudo.items) {
      if (!("str" in item)) continue;
      texto += item.str + (item.hasEOL ? "\n" : "");
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
    for (const row of xml.matchAll(tag("row"))) {
      const cels: string[] = [];
      for (const c of (row[2] ?? "").matchAll(tag("c"))) {
        const tipo = c[1].match(/\bt="([^"]*)"/)?.[1];
        const corpo = c[2] ?? "";
        const v = corpo.match(tag("v"))?.[0].replace(/<[^>]*>/g, "");
        let t = "";
        if (tipo === "s") t = textos[Number(v)] ?? "";
        else if (tipo === "inlineStr") t = textoRico(corpo);
        else if (tipo !== "e" && tipo !== "b" && v) t = decodificar(v);
        t = t.replace(/\s+/g, " ").trim();
        if (t) cels.push(t);
      }
      // "Caderno brochura | 2": a coluna de quantidade depois do nome vai para a
      // frente, que é onde a leitura procura a quantidade.
      const qtd = cels.findIndex((t, i) => i > 0 && /^\d{1,2}$/.test(t));
      if (qtd > 0 && !/^\d/.test(cels[0])) cels.unshift(...cels.splice(qtd, 1));
      if (cels.length) linhas.push(cels.join(" "));
    }
  }
  return linhas.join("\n");
}
