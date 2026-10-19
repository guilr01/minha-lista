import ExcelJS from "exceljs";
import { FAIXAS, ROTULO_FAIXA, type Faixa } from "./faixa";

// A planilha do catálogo: o modelo que a papelaria baixa, preenche e sobe.
// Uma linha por produto, com marca e preço de cada faixa lado a lado (sem
// categoria nem unidade, decisão de 19/10/2026: cada produto conta como 1). É
// assim que a papelaria pensa o item ("caderno: Tilibra a 18, Foroni a 25").
//
// Esta parte só LÊ e ESCREVE o arquivo, sem banco: a gravação fica em
// src/lib/cadastro.ts (importarCatalogo), com as mesmas regras do formulário.
// Ler as colunas pelo NOME do cabeçalho, e não pela posição, deixa a pessoa
// reordenar ou apagar coluna sem estragar a importação.

export const ABA = "Catálogo";
export const LIMITE_DE_LINHAS = 3000;

type Coluna = { chave: string; titulo: string; largura: number };

const COLUNAS: Coluna[] = [
  { chave: "produto", titulo: "Produto", largura: 40 },
  ...FAIXAS.flatMap((f) => [
    { chave: `${f}:marca`, titulo: `${ROTULO_FAIXA[f]} · marca`, largura: 20 },
    { chave: `${f}:preco`, titulo: `${ROTULO_FAIXA[f]} · preço (R$)`, largura: 17 },
  ]),
];

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** O texto de uma célula, qualquer que seja o tipo que o Excel guardou. */
function texto(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((r) => r.text).join("").trim();
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return texto(v.result as ExcelJS.CellValue);
  }
  return String(v).trim();
}

/** "18,9" · "R$ 18,90" · 18.9 · "1.234,50" → centavos. null = vazio; NaN = ilegível. */
export function lerPreco(v: ExcelJS.CellValue): number | null {
  if (v && typeof v === "object" && "result" in v) return lerPreco(v.result as ExcelJS.CellValue);
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : NaN;
  const t = texto(v).replace(/R\$/i, "").replace(/\s/g, "");
  if (!t) return null;
  // Com vírgula, é o jeito brasileiro: ponto é milhar. Sem vírgula, ponto é decimal.
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export type LinhaDaPlanilha = {
  linha: number;
  nome: string;
  opcoes: Partial<Record<Faixa, { marca: string; preco_centavos: number }>>;
};

export type LeituraDaPlanilha = {
  linhas: LinhaDaPlanilha[];
  erros: { linha: number; mensagem: string }[];
};

export class PlanilhaInvalida extends Error {}

export async function lerPlanilha(arquivo: ArrayBuffer): Promise<LeituraDaPlanilha> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arquivo);
  } catch {
    throw new PlanilhaInvalida("Não consegui abrir o arquivo. Envie a planilha em Excel (.xlsx), de preferência o modelo baixado aqui.");
  }
  const aba = wb.getWorksheet(ABA) ?? wb.worksheets.find((w) => w.state === "visible");
  if (!aba) throw new PlanilhaInvalida("A planilha está vazia.");

  // O cabeçalho é a primeira linha que tem "Produto" em alguma coluna.
  let linhaDoCabecalho = 0;
  const posicao = new Map<string, number>();
  for (let r = 1; r <= Math.min(aba.rowCount, 10) && !linhaDoCabecalho; r++) {
    const row = aba.getRow(r);
    row.eachCell((c, col) => {
      const t = normalizar(texto(c.value));
      const coluna = COLUNAS.find((k) => normalizar(k.titulo) === t || normalizar(k.chave.replace(":", " ")) === t);
      if (coluna) posicao.set(coluna.chave, col);
    });
    if (posicao.has("produto")) linhaDoCabecalho = r;
    else posicao.clear();
  }
  if (!linhaDoCabecalho) {
    throw new PlanilhaInvalida("Não encontrei a coluna \"Produto\". Use o modelo baixado aqui, sem mudar os títulos da primeira linha.");
  }
  if (!FAIXAS.some((f) => posicao.has(`${f}:preco`))) {
    throw new PlanilhaInvalida("Não encontrei nenhuma coluna de preço. Use o modelo baixado aqui, sem mudar os títulos da primeira linha.");
  }

  const linhas: LinhaDaPlanilha[] = [];
  const erros: LeituraDaPlanilha["erros"] = [];
  const vistos = new Map<string, number>();
  const valor = (row: ExcelJS.Row, chave: string) => {
    const col = posicao.get(chave);
    return col ? row.getCell(col).value : null;
  };

  for (let r = linhaDoCabecalho + 1; r <= aba.rowCount; r++) {
    const row = aba.getRow(r);
    const nome = texto(valor(row, "produto")).replace(/\s+/g, " ");
    const resto = COLUNAS.slice(1).some((c) => texto(valor(row, c.chave)));
    if (!nome && !resto) continue; // linha em branco
    if (linhas.length + erros.length >= LIMITE_DE_LINHAS) {
      throw new PlanilhaInvalida(`A planilha passa de ${LIMITE_DE_LINHAS} produtos. Divida em mais de um arquivo.`);
    }
    const problemas: string[] = [];
    if (nome.length < 2) problemas.push("falta o nome do produto");
    if (nome.length > 160) problemas.push("nome com mais de 160 caracteres");

    const opcoes: LinhaDaPlanilha["opcoes"] = {};
    for (const f of FAIXAS) {
      const marca = texto(valor(row, `${f}:marca`)).replace(/\s+/g, " ");
      const preco = lerPreco(valor(row, `${f}:preco`));
      if (!marca && preco === null) continue;
      const faixa = ROTULO_FAIXA[f];
      if (preco === null) problemas.push(`${faixa}: falta o preço`);
      else if (Number.isNaN(preco)) problemas.push(`${faixa}: preço ilegível`);
      else if (preco <= 0) problemas.push(`${faixa}: o preço precisa ser maior que zero`);
      else if (preco > 10_000_000) problemas.push(`${faixa}: preço alto demais`);
      if (!marca) problemas.push(`${faixa}: falta a marca`);
      else if (marca.length > 80) problemas.push(`${faixa}: marca com mais de 80 caracteres`);
      if (marca && preco && !Number.isNaN(preco) && preco > 0) opcoes[f] = { marca, preco_centavos: preco };
    }
    if (!problemas.length && !Object.keys(opcoes).length) problemas.push("preencha a marca e o preço de pelo menos uma faixa");

    const chave = normalizar(nome);
    if (nome && vistos.has(chave)) problemas.push(`produto repetido (também na linha ${vistos.get(chave)})`);
    else if (nome) vistos.set(chave, r);

    if (problemas.length) {
      erros.push({ linha: r, mensagem: `${nome || "Sem nome"}: ${problemas.join("; ")}` });
      continue;
    }
    linhas.push({ linha: r, nome, opcoes });
  }
  return { linhas, erros };
}

/** Chave de comparação de nome: "Caderno  10 Matérias" casa com "caderno 10 materias". */
export const chaveDoNome = normalizar;

export type ProdutoParaPlanilha = {
  nome: string;
  opcoes: { faixa: Faixa; marca: string; preco_centavos: number }[];
};

/** O modelo em branco, ou o catálogo atual no mesmo formato para editar e subir de volta. */
export async function gerarPlanilha(produtos: ProdutoParaPlanilha[] = []): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lista Pronta";
  const aba = wb.addWorksheet(ABA, { views: [{ state: "frozen", ySplit: 1 }] });
  aba.columns = COLUNAS.map((c) => ({ key: c.chave, width: c.largura }));

  const cabecalho = aba.getRow(1);
  COLUNAS.forEach((c, i) => {
    const cel = cabecalho.getCell(i + 1);
    cel.value = c.titulo;
    cel.font = { bold: true, color: { argb: "FFFFFFFF" } };
    const faixa = c.chave.split(":")[0];
    const cor = faixa === "economica" ? "FF3B6EA8" : faixa === "intermediaria" ? "FF1F4F8F" : faixa === "premium" ? "FF1B2430" : "FF5A6472";
    cel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
    cel.alignment = { vertical: "middle", wrapText: true };
  });
  cabecalho.height = 32;

  for (const p of produtos) {
    const linha: Record<string, string | number> = { produto: p.nome };
    for (const o of p.opcoes) {
      linha[`${o.faixa}:marca`] = o.marca;
      linha[`${o.faixa}:preco`] = o.preco_centavos / 100;
    }
    aba.addRow(linha);
  }

  // Formato e validação até a linha 1000: o Excel ajuda a não errar o preço.
  const ultima = Math.max(1000, produtos.length + 200);
  COLUNAS.forEach((c, i) => {
    const col = aba.getColumn(i + 1);
    if (c.chave.endsWith(":preco")) {
      col.numFmt = '"R$" #,##0.00';
      for (let r = 2; r <= ultima; r++) {
        aba.getCell(r, i + 1).dataValidation = {
          type: "decimal", operator: "greaterThan", formulae: [0], allowBlank: true,
          showErrorMessage: true, errorTitle: "Preço", error: "Digite só o número do preço, por exemplo 12,90.",
        };
      }
    }
  });

  const ajuda = wb.addWorksheet("Como preencher");
  ajuda.getColumn(1).width = 110;
  const instrucoes = [
    ["Como preencher o catálogo", true],
    ["", false],
    ["1. Use a aba \"Catálogo\". Uma linha por produto. Não mude os títulos da primeira linha.", false],
    ["2. Produto: o nome como o cliente vai ver, já dizendo o que vem nele. Ex.: Papel sulfite A4 pacote com 100 folhas.", false],
    ["   Cada produto conta como 1 item: o pacote de 100 folhas é 1, não 100.", false],
    ["3. Faixas: preencha a MARCA e o PREÇO de cada faixa que você vende. Pode preencher só uma ou duas.", false],
    ["   Econômica = a opção mais em conta. Intermediária = boa qualidade. Premium = as melhores marcas.", false],
    ["4. Preço: só o número, com vírgula. Ex.: 12,90.", false],
    ["", false],
    ["Ao subir a planilha:", true],
    ["• Produto com o mesmo nome de um que já existe é ATUALIZADO (marcas e preços).", false],
    ["• Produto novo é criado.", false],
    ["• Faixa deixada em branco não muda nada no que já está cadastrado.", false],
    ["• Nenhum produto é apagado. Para tirar um produto, desative-o no painel.", false],
    ["• Antes de gravar, o painel mostra o que vai entrar e aponta as linhas com problema.", false],
    ["", false],
    ["Exemplo de linha:", true],
    ["Caderno universitário 10 matérias | Tilibra | 18,90 | Foroni | 26,50 | Jandaia | 34,90", false],
  ] as const;
  instrucoes.forEach(([t, negrito], i) => {
    const cel = ajuda.getCell(i + 1, 1);
    cel.value = t;
    if (negrito) cel.font = { bold: true, size: i === 0 ? 14 : 11 };
  });

  return new Uint8Array(await wb.xlsx.writeBuffer());
}
