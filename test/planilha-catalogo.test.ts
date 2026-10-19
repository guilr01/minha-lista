import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ABA, PlanilhaInvalida, gerarPlanilha, lerPlanilha, lerPreco } from "@/lib/planilha-catalogo";

const paraArrayBuffer = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

/** Preenche o modelo de verdade, como a papelaria faria no Excel. */
async function preencher(linhas: (string | number | null)[][], ajuste?: (aba: ExcelJS.Worksheet) => void) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(paraArrayBuffer(await gerarPlanilha()));
  const aba = wb.getWorksheet(ABA)!;
  linhas.forEach((l, i) => l.forEach((v, j) => { if (v !== null) aba.getCell(i + 2, j + 1).value = v; }));
  ajuste?.(aba);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describe("preço lido da planilha", () => {
  it("aceita número do Excel e texto no jeito brasileiro", () => {
    expect(lerPreco(18.9)).toBe(1890);
    expect(lerPreco("18,90")).toBe(1890);
    expect(lerPreco("R$ 1.234,50")).toBe(123450);
    expect(lerPreco("12.5")).toBe(1250);
    expect(lerPreco("")).toBeNull();
    expect(lerPreco("doze")).toBeNaN();
    expect(lerPreco(0.1 + 0.2)).toBe(30);
  });
});

describe("leitura da planilha do catálogo", () => {
  it("lê o modelo preenchido: nome, categoria, unidade e as faixas que vieram", async () => {
    const r = await lerPlanilha(await preencher([
      ["Caderno 10 matérias", "Tilibra", 18.9, "Foroni", "26,50", "Jandaia", 34.9],
      ["Lápis grafite", "Faber", 1.5, null, null, null, null],
    ]));
    expect(r.erros).toEqual([]);
    expect(r.linhas).toEqual([
      { linha: 2, nome: "Caderno 10 matérias", opcoes: {
        economica: { marca: "Tilibra", preco_centavos: 1890 },
        intermediaria: { marca: "Foroni", preco_centavos: 2650 },
        premium: { marca: "Jandaia", preco_centavos: 3490 } } },
      { linha: 3, nome: "Lápis grafite", opcoes: { economica: { marca: "Faber", preco_centavos: 150 } } },
    ]);
  });

  it("aponta cada problema com a linha, e não deixa a linha com problema entrar", async () => {
    const r = await lerPlanilha(await preencher([
      ["Borracha", "Mercur", null, null, null, null, null],
      ["", "Tilibra", 10, null, null, null, null],
      ["Cola", null, 5, null, null, null, null],
      ["Régua", null, null, null, null, null, null],
      ["Tesoura", "Tramontina", "caro", null, null, null, null],
      ["Caderno", "X", 10, null, null, null, null],
      ["caderno ", "Y", 12, null, null, null, null],
      [null, null, null, null, null, null, null],
    ]));
    expect(r.linhas.map((l) => l.nome)).toEqual(["Caderno"]);
    expect(r.erros).toEqual([
      { linha: 2, mensagem: "Borracha: Econômica: falta o preço" },
      { linha: 3, mensagem: "Sem nome: falta o nome do produto" },
      { linha: 4, mensagem: "Cola: Econômica: falta a marca" },
      { linha: 5, mensagem: "Régua: preencha a marca e o preço de pelo menos uma faixa" },
      { linha: 6, mensagem: "Tesoura: Econômica: preço ilegível" },
      { linha: 8, mensagem: "caderno: produto repetido (também na linha 7)" },
    ]);
  });

  it("planilha antiga, com Categoria e Unidade, ainda é lida: as colunas a mais são ignoradas", async () => {
    const wb = new ExcelJS.Workbook();
    const aba = wb.addWorksheet("Catálogo");
    aba.addRow(["Produto", "Categoria", "Unidade", "Econômica · marca", "Econômica · preço (R$)"]);
    aba.addRow(["Régua 30 cm", "Corte e medição", "un", "Waleu", 3.5]);
    const r = await lerPlanilha((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toEqual([{ linha: 2, nome: "Régua 30 cm", opcoes: { economica: { marca: "Waleu", preco_centavos: 350 } } }]);
  });

  it("o modelo não tem mais Categoria nem Unidade", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(paraArrayBuffer(await gerarPlanilha()));
    const titulos = (wb.getWorksheet(ABA)!.getRow(1).values as unknown[]).slice(1);
    expect(titulos).toEqual([
      "Produto", "Econômica · marca", "Econômica · preço (R$)", "Intermediária · marca",
      "Intermediária · preço (R$)", "Premium · marca", "Premium · preço (R$)",
    ]);
  });

  it("lê pelo título da coluna, não pela posição", async () => {
    const wb = new ExcelJS.Workbook();
    const aba = wb.addWorksheet("Minha aba");
    aba.addRow(["Premium · preço (R$)", "Premium · marca", "Produto"]);
    aba.addRow([20, "Faber", "Lápis de cor"]);
    const r = await lerPlanilha((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(r.linhas[0]).toMatchObject({ nome: "Lápis de cor", opcoes: { premium: { marca: "Faber", preco_centavos: 2000 } } });
  });

  it("recusa arquivo que não é planilha e planilha sem a coluna Produto", async () => {
    await expect(lerPlanilha(new TextEncoder().encode("isto não é excel").buffer as ArrayBuffer)).rejects.toThrow(PlanilhaInvalida);
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("x").addRow(["Nome", "Valor"]);
    await expect(lerPlanilha((await wb.xlsx.writeBuffer()) as ArrayBuffer)).rejects.toThrow(/coluna "Produto"/);
  });

  it("o catálogo exportado volta igual ao ser lido", async () => {
    const arquivo = await gerarPlanilha([
      { nome: "Cola bastão", opcoes: [
        { faixa: "economica", marca: "Acrilex", preco_centavos: 390 }, { faixa: "premium", marca: "Pritt", preco_centavos: 1290 }] },
    ]);
    const r = await lerPlanilha(paraArrayBuffer(arquivo));
    expect(r.erros).toEqual([]);
    expect(r.linhas[0]).toEqual({ linha: 2, nome: "Cola bastão", opcoes: {
      economica: { marca: "Acrilex", preco_centavos: 390 }, premium: { marca: "Pritt", preco_centavos: 1290 } } });
  });
});
