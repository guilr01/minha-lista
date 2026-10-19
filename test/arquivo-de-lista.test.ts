import ExcelJS from "exceljs";
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

  it("recusa formato que não lê, com o caminho de colar o texto", async () => {
    await expect(textoDoArquivo("foto.jpg", new ArrayBuffer(10))).rejects.toThrow(ArquivoIlegivel);
    await expect(textoDoArquivo("lista.pdf", ab(new TextEncoder().encode("não é pdf")))).rejects.toThrow(/cole/);
  });
});
