import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { ArquivoIlegivel, textoDoArquivo } from "@/lib/arquivo-de-lista";
import { lerLinhas } from "@/lib/lista-da-escola";

const ab = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe("texto do arquivo da escola", () => {
  it("lê texto em UTF-8 e o salvo no Windows (Latin-1) sem estragar o acento", async () => {
    expect(await textoDoArquivo("lista.txt", ab(new TextEncoder().encode("2 lápis de cor")))).toBe("2 lápis de cor");
    const latin1 = Uint8Array.from([...("2 l" + "á" + "pis")].map((c) => c.charCodeAt(0)));
    expect(await textoDoArquivo("lista.txt", ab(latin1))).toBe("2 lápis");
  });

  it("lê a planilha linha a linha, juntando as células", async () => {
    const wb = new ExcelJS.Workbook();
    const aba = wb.addWorksheet("Lista");
    aba.addRow([2, "cadernos brochura"]);
    aba.addRow(["1", "tesoura sem ponta"]);
    const texto = await textoDoArquivo("lista.xlsx", (await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(lerLinhas(texto).map((l) => [l.quantidade, l.descricao])).toEqual([[2, "cadernos brochura"], [1, "tesoura sem ponta"]]);
  });

  it("lê a planilha que o ExcelJS recusa: prefixo de namespace, texto embutido e texto rico", async () => {
    // Do jeito que o Google Planilhas e outros geradores gravam, e com
    // pedaços que nada têm a ver com o texto (desenho, mesclagem).
    const zip = new JSZip();
    zip.file("[Content_Types].xml", "<Types/>");
    zip.file("xl/sharedStrings.xml",
      '<x:sst xmlns:x="x"><x:si><x:t>LISTA DE MATERIAL &amp; LIVROS</x:t></x:si>' +
      '<x:si><x:r><x:t>caderno </x:t></x:r><x:r><x:t xml:space="preserve">brochura</x:t></x:r><x:rPh><x:t>カ</x:t></x:rPh></x:si></x:sst>');
    zip.file("xl/worksheets/sheet1.xml",
      '<x:worksheet xmlns:x="x"><x:cols><x:col min="1"/></x:cols><x:sheetData>' +
      '<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" s="2"/></x:row>' +
      '<x:row r="2"><x:c r="A2"><x:v>2</x:v></x:c><x:c r="B2" t="s"><x:v>1</x:v></x:c></x:row>' +
      '<x:row r="3"><x:c r="A3" t="inlineStr"><x:is><x:t>1 tesoura sem ponta</x:t></x:is></x:c><x:c r="B3" t="e"><x:v>#REF!</x:v></x:c></x:row>' +
      '</x:sheetData><x:mergeCells><x:mergeCell ref="A1:B1"/></x:mergeCells><x:drawing r:id="rId1"/></x:worksheet>');
    zip.file("xl/drawings/drawing1.xml", "<xdr:wsDr/>");
    const texto = await textoDoArquivo("1o. ano.xlsx", await zip.generateAsync({ type: "arraybuffer" }));
    expect(texto).toBe("LISTA DE MATERIAL & LIVROS\n2 caderno brochura\n1 tesoura sem ponta");
  });

  it("explica o que fazer com o .xls antigo, mesmo renomeado para .xlsx", async () => {
    const ole = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    await expect(textoDoArquivo("lista.xlsx", ab(ole))).rejects.toThrow(/Salvar como/);
    await expect(textoDoArquivo("lista.xls", ab(ole))).rejects.toThrow(/Salvar como/);
  });

  it("recusa formato que não lê, com o caminho de colar o texto", async () => {
    await expect(textoDoArquivo("foto.jpg", new ArrayBuffer(10))).rejects.toThrow(ArquivoIlegivel);
    await expect(textoDoArquivo("lista.pdf", ab(new TextEncoder().encode("não é pdf")))).rejects.toThrow(/cole/);
  });
});
