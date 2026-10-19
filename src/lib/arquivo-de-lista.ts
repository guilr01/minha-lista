import "server-only";
import ExcelJS from "exceljs";

// Tira o texto do arquivo que a escola mandou. Foto não entra: ler imagem
// exigiria reconhecimento de texto, e a lista em PDF, Word ou mensagem cobre
// o caso comum. O que sai daqui vai para lerLinhas (src/lib/lista-da-escola.ts).

export class ArquivoIlegivel extends Error {}

export const TIPOS_ACEITOS = ".pdf,.docx,.xlsx,.csv,.txt";

export async function textoDoArquivo(nome: string, dados: ArrayBuffer): Promise<string> {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  try {
    if (ext === "pdf") return await textoDoPdf(dados);
    if (ext === "docx") {
      const mammoth = await import("mammoth");
      return (await mammoth.extractRawText({ buffer: Buffer.from(dados) })).value;
    }
    if (ext === "xlsx") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(dados);
      const linhas: string[] = [];
      for (const aba of wb.worksheets) {
        aba.eachRow((row) => {
          const cels: string[] = [];
          row.eachCell((c) => { const t = c.text?.trim(); if (t) cels.push(t); });
          if (cels.length) linhas.push(cels.join(" "));
        });
      }
      return linhas.join("\n");
    }
    if (ext === "txt" || ext === "csv") {
      const utf8 = new TextDecoder("utf-8").decode(dados);
      // Arquivo salvo no Windows costuma vir em Latin-1: os acentos viram "�".
      const texto = utf8.includes("�") ? new TextDecoder("windows-1252").decode(dados) : utf8;
      return ext === "csv" ? texto.replace(/[;,\t]+/g, " ") : texto;
    }
  } catch {
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
