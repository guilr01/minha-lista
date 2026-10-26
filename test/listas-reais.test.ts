import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { textoDoArquivo } from "@/lib/arquivo-de-lista";
import { atendeExigencia, lerLinhas, sugerir } from "@/lib/lista-da-escola";

// Listas reais de quatro escolas (20/10/2026), uma por padrão. O texto dos
// PDFs está como a extração o entrega, com nome, endereço, telefone e site
// das escolas trocados por dados fictícios. A planilha é refeita célula a
// célula com a mesma estrutura da original.
//
// A asserção é a lista EXATA de itens: frase que vira item quebra o teste,
// e item que some também.

const fixture = (nome: string) => readFileSync(new URL(`./fixtures/listas-de-escolas/${nome}`, import.meta.url), "utf8");
const itens = (t: string) => lerLinhas(t).filter((l) => l.item).map((l) => [l.quantidade, l.descricao]);
const fora = (t: string, motivo: string) => lerLinhas(t).filter((l) => l.motivo === motivo).map((l) => l.original);

describe("lista por disciplina, com bloco de livro e parágrafos de recado", () => {
  const t = fixture("por-disciplina.txt");

  it("só o material passa", () => {
    expect(itens(t)).toEqual([
      [2, "revistas com fotos coloridas para recorte"],
      [2, "folhas de raio X ou 02 folhas acetato A4"],
      [1, "pacote ou 01 bloco A4 300g/m2 20 folhas CANSON"],
      [1, "pacote de 50 folhas de desenho A4 brancas A4 180g"],
      // "01 estojo contendo lápis ou lapiseira, borracha, …": o estojo e cada coisa dentro dele.
      [1, "estojo"],
      [1, "lápis ou lapiseira"],
      [1, "borracha"],
      [1, "apontador"],
      [1, "caneta esferográfica azul e preta"],
      [1, "régua"],
      [1, "caneta marca-texto"],
      [1, "tesoura sem ponta"],
      [1, "cola bastão 40g"],
      [1, "pacote de marcadores de páginas removíveis"],
      [1, "corretivo de boa qualidade"],
      [1, "garrafa para água"],
      [1, "pasta fichário ou catálogo com 50/100 saquinhos plásticos"],
      [1, "calculadora simples pequena"],
      [1, "régua"],
      [1, "transferidor 180º"],
      [1, "compasso"],
      [1, "kit de esquadros"],
      [1, "jaleco"],
      [1, "pasta com 20 plásticos tamanho A4"],
      [1, "Tabela Periódica"],
    ]);
  });

  it("livro sem a palavra livro sai pelo bloco Autor / Editora / ISBN logo abaixo do título", () => {
    const livros = fora(t, "livro");
    // Cada livro é UMA linha, com a ficha grudada no título.
    expect(livros).toContain("Capitães de areia · Autor: Jorge Amado · Editora: Companhia de bolso · ISBN: 9788535914061");
    // O nome do segundo autor veio na linha de baixo do PDF e volta para a mesma ficha.
    expect(livros).toContain("Sociologia hoje · Autores: Igor José de Reno Machado, Henrique Amorim e Celso Rocha de Barros · Editora: Plural/Ática · ISBN: 9788508197804");
    for (const titulo of ["PERSPECTIVES 2B COMBO SPLIT", "A visão das plantas", "Sociologia hoje", "Sistema de ensino FTD"]) {
      expect(livros.some((l) => l.startsWith(titulo)), titulo).toBe(true);
    }
    // A frase do calendário logo acima de "A visão das plantas" é recado, não título de livro.
    expect(livros.some((l) => l.includes("calendário"))).toBe(false);
  });

  it("recado de quem já tem o material não vira item", () => {
    const textos = fora(t, "texto");
    expect(textos).toContain("Estudantes que já possuem não precisarão adquirir um novo.");
    expect(textos.some((l) => l.startsWith("Cadernos: são de livre escolha"))).toBe(true);
  });
});

describe("lista com instrução colada em cada item", () => {
  const t = fixture("instrucao-no-item.txt");
  const linhas = lerLinhas(t);

  it("só o material passa, e o parágrafo numerado do IMPORTANTE não vira item", () => {
    expect(itens(t)).toEqual([
      [2, "cadernos brochura capa dura de 50 folhas"],
      [1, "caderno de desenho espiral de 50 folhas"],
      [3, "estojos de plástico de zíper"],
      [3, "lápis pretos apontados"],
      [1, "borracha branca"],
      [1, "apontador com depósito"],
      [1, "caixa de lápis de cor grande - 24 cores"],
      [1, "caixa de giz de cera curto triangular - 12 cores"],
      [1, "jogo de canetas hidrográficas - 12 cores"],
      [8, "potes de massa de modelar soft 150 gramas, nas cores: azul, amarela, vermelha, laranja, verde, marrom, salmão e maravilha"],
      [1, "flanela"],
      [2, "tubos pequenos de cola branca"],
      [2, "tubos pequenos de cola em bastão"],
      [1, "caixa de guache lavável"],
      [1, "pincel nº 12"],
      [1, "caixa de tinta plástica"],
      [1, "tesoura sem ponta"],
      [1, "pasta com elástico"],
      [1, "pasta com elástico"],
      [1, "copo de plástico duro"],
      [1, "lancheira"],
      [1, "guardanapo pequeno de tecido dentro da lancheira"],
      [1, "nécessaire com escova de dente"],
      [1, "creme dental"],
      [1, "toalha de mão"],
      [1, "mala ou mochila"],
    ]);
  });

  it("a instrução vai para a observação, que o cliente lê, e o \"(a)\" de aluno(a) some", () => {
    const lapis = linhas.find((l) => l.descricao === "lápis pretos apontados")!;
    expect(lapis.observacao).toBe("colocar o nome completo do aluno e série em cada lápis");
    expect(linhas.find((l) => l.descricao === "tesoura sem ponta")!.observacao).toBe("sugestão - Mundial; com nome completo do aluno gravado");
  });

  it("o que se compra no próprio colégio fica fora, com o motivo", () => {
    expect(fora(t, "escola")).toEqual([
      "1 sacola xadrez azul personalizada (adquirida no Colégio)",
      "1 sacola azul marinho personalizada (adquirida no Colégio)",
      "1 avental personalizado para a aula de pintura (adquirido no Colégio)",
    ]);
  });
});

describe("lista com \"Livro:\", coleção e disciplina como título", () => {
  const t = fixture("livro-com-rotulo.txt");

  it("nenhum livro passa, e o material passa inteiro", () => {
    expect(itens(t)).toEqual([
      [1, "caderno universitário de capa dura de 96 folhas"],
      [1, "Bloco Aquarela A4 - 300g – com 12 folhas"],
      [1, "caixa de tinta Guache com 12 cores"],
      [1, "caixa de Giz Pastel oleoso com 12 cores"],
      [1, "Caderno de desenho sem pauta - 80 folhas"],
      [1, "Planner, em papel"],
      [5, "cadernos universitários de capa dura de 96 folhas"],
      [1, "caderno de 100 folhas capa dura quadriculado 7x7 mm"],
      // "1 estojo completo com: lápis…, caneta azul, preta e vermelha, borracha, …" (três linhas no PDF).
      [1, "estojo completo"],
      [1, "lápis preto e/ou lapiseira com grafite reserva"],
      [1, "caneta azul, preta e vermelha"],
      [1, "borracha"],
      [1, "apontador com depósito"],
      [1, "tesoura"],
      [1, "cola"],
      [1, "régua de 30 cm"],
      [1, "compasso"],
      [1, "transferidor"],
      [1, "jogo de esquadro"],
      [1, "caixa de lápis de cor"],
      [1, "caixa de canetinha hidrográfica com 12 cores"],
      [1, "pasta catálogo transparente com 20 sacos plásticos"],
      [1, "pasta com elástico transparente"],
      [1, "avental de manga longa de algodão"],
      [1, "calculadora simples com operações básicas"],
      [3, "blocos autoadesivos tipo post-it"],
    ]);
    // Dez livros, cada um com a sua ficha (Coleção, Autor, Editora, ISBN) na mesma linha.
    const livros = fora(t, "livro");
    expect(livros).toHaveLength(10);
    expect(livros).toContain("Livro: Extraordinário · Autor: R. J. Palacio · Editora: Intrínseca · ISBN: 9788580573015");
  });
});

describe("planilha montada por papelaria: quantidade · descrição + disciplina · valor · total", () => {
  async function planilha(): Promise<string> {
    const wb = new ExcelJS.Workbook();
    const aba = wb.addWorksheet("Plan1");
    const linha = (r: number, valores: Record<string, ExcelJS.CellValue>) => {
      for (const [col, v] of Object.entries(valores)) aba.getCell(`${col}${r}`).value = v;
    };
    linha(1, { A: "PAPELARIA EXEMPLO" });
    linha(2, { A: "Rua das Acácias, 100 - Centro" });
    linha(3, { A: "FONE:                 11 3000-0000          e-mail: contato@papelariaexemplo.com.br" });
    linha(5, { A: "                           LISTA DE MATERIAL 2026 - 1o. Ano Ensino Fundamental                    data___/___/___" });
    linha(6, { C: "Valor unit", D: "Total" });
    linha(7, { A: 1, B: "caderno de desenho capa dura e espiral com 96 folhas                          Inglês", C: "13,50/22,90", D: 13.5 });
    linha(8, { A: 1, B: "cx tinta guache em bastão neon com 6 cores                                    Artes", C: 35.9, D: 35.9 });
    linha(9, { A: 1, B: "mochila  42 x 30 larg" });
    linha(10, { A: 6, B: "lápis preto nº 2", C: "1,50/2,30", D: 9 });
    linha(11, { A: 1, B: "tesoura escolar sem ponta com nome", C: 8.6, D: 8.6 });
    linha(12, { A: 2, B: "cadernos de desenho espiral cpa dura 48 folhas", C: "16,9/22,90", D: 33.799999999999997 });
    linha(13, { A: 2, B: "dados", C: 2, D: 4 });
    linha(14, { D: 376.79999999999995 });
    linha(16, { B: "LIVROS" });
    linha(18, { B: "Perigoso! Este livro contém coelhos", C: 39.9 });
    linha(19, { B: "Brasil 100 palavras", C: 89.9 });
    linha(20, { B: "Mesma nova história", C: 70 });
    linha(21, { B: "Quanto lixo: desperdício, reciclagem e proteção do planeta", C: 54.9 });
    linha(22, { C: 254.70000000000002 });
    linha(28, { B: "ETIQUETA", C: 5 });
    linha(29, { B: "TOTAL" });
    linha(30, { A: "Resp:" });
    linha(31, { A: "Aluno(a):", B: "                                                  Fone" });
    return textoDoArquivo("1o. ano.xlsx", (await wb.xlsx.writeBuffer()) as ArrayBuffer);
  }

  it("valor e total ficam fora, a disciplina vira observação e a seção de livros sai inteira", async () => {
    const t = await planilha();
    const linhas = lerLinhas(t);
    expect(linhas.filter((l) => l.item).map((l) => [l.quantidade, l.descricao, l.observacao])).toEqual([
      [1, "caderno de desenho capa dura e espiral com 96 folhas", "Inglês"],
      [1, "tinta guache em bastão neon com 6 cores", "Artes"],
      [1, "mochila 42 x 30 larg", ""],
      [6, "lápis preto nº 2", ""],
      [1, "tesoura escolar sem ponta", "com nome"],
      [2, "cadernos de desenho espiral cpa dura 48 folhas", ""],
      [2, "dados", ""],
      // Depois do vão de linhas em branco, a seção de livros acabou: a etiqueta é material.
      [1, "ETIQUETA", ""],
    ]);
    // Os 70 reais de "Mesma nova história" eram lidos como quantidade quando a planilha era lida por posição.
    expect(fora(t, "livro")).toEqual([
      "Perigoso!",
      "Este livro contém coelhos",
      "Brasil 100 palavras",
      "Mesma nova história",
      "Quanto lixo: desperdício, reciclagem e proteção do planeta",
    ]);
  });
});

// Padrões que as quatro listas não têm, mas que aparecem em lista de escola.
describe("padrões previstos", () => {
  it("caixinha de marcar na frente do item", () => {
    expect(itens("( ) 2 cadernos brochura\n[ ] 1 borracha\n☐ 3 lápis pretos")).toEqual([
      [2, "cadernos brochura"], [1, "borracha"], [3, "lápis pretos"],
    ]);
  });

  it("pontilhado até a quantidade, e \"Qtd:\" no meio da linha", () => {
    expect(itens("Caderno brochura ........ 2\nCola bastão … 3\nTesoura sem ponta - Qtd: 1\nRégua 30 cm (qtde 2)")).toEqual([
      [2, "Caderno brochura"], [3, "Cola bastão"], [1, "Tesoura sem ponta"], [2, "Régua 30 cm"],
    ]);
  });

  it("colunas coladas do Excel (tabulação), com a quantidade depois do nome e o preço no fim", () => {
    expect(itens("Material\tQtd\tValor\nCaderno brochura\t2\t13,90\nBorracha branca\t1\t2,50")).toEqual([
      [2, "Caderno brochura"], [1, "Borracha branca"],
    ]);
  });

  it("livro marcado só pela editora no fim, pelo ISBN ou por \"Ed.\"", () => {
    const t = "Ápis Língua Portuguesa 1º ano – Ática\nMeu primeiro atlas (Ed. Moderna)\nO menino maluquinho 9788506000000\n1 caderno brochura";
    expect(itens(t)).toEqual([[1, "caderno brochura"]]);
    expect(fora(t, "livro")).toHaveLength(3);
  });

  it("dicionário, atlas, gramática e apostila são livro, mesmo com quantidade", () => {
    const t = "1 dicionário escolar\n1 minidicionário Aurélio\n1 atlas geográfico\n1 apostila do sistema de ensino\n1 cola bastão";
    expect(itens(t)).toEqual([[1, "cola bastão"]]);
  });

  it("parágrafo numerado debaixo de \"Observações\" não é quantidade", () => {
    expect(itens("OBSERVAÇÕES:\n1. Mochila de rodinhas não é permitida.\n2 fotos 3x4")).toEqual([[2, "fotos 3x4"]]);
  });

  it("debaixo de \"Uniforme\" ou \"Observações\", roupa e recado não passam", () => {
    const t = "UNIFORME\n2 camisetas brancas com o logo do colégio\n1 agasalho\nOBSERVAÇÕES:\nTrazer uma muda de roupa e uma toalha de rosto.";
    expect(itens(t)).toEqual([]);
  });

  it("CSV com ponto e vírgula não quebra o preço em dois números", async () => {
    const csv = new TextEncoder().encode("Qtd;Material;Valor\n2;Caderno brochura;13,90\n1;Borracha branca;2,50");
    const t = await textoDoArquivo("lista.csv", csv.buffer as ArrayBuffer);
    expect(itens(t)).toEqual([[2, "Caderno brochura"], [1, "Borracha branca"]]);
  });
});

// Apontamentos de um usuário de verdade (23/10/2026), com o texto exato que ele colou.
describe("apontamentos de um usuário", () => {
  const linha = (t: string) => lerLinhas(t).filter((l) => l.item);

  it("item dentro de item: o estojo não some", () => {
    expect(itens("01 estojo com 02 lápis grafite Jumbo")).toEqual([[1, "estojo"], [2, "lápis grafite Jumbo"]]);
    expect(itens("01 estojo leve e prático, com 01 caixa de lápis de cor (12 cores)")).toEqual([
      [1, "estojo leve e prático"], [1, "caixa de lápis de cor"],
    ]);
  });

  it("mas o que é parte do item continua junto", () => {
    expect(itens("1 pasta com 20 plásticos\n1 estojo com 3 divisórias\n01 estojo com zíper\nCaneta azul - 2 unidades")).toEqual([
      [1, "pasta com 20 plásticos"], [1, "estojo com 3 divisórias"], [1, "estojo com zíper"], [2, "Caneta azul"],
    ]);
  });

  it("lista colada numa linha só: a garrafa não some", () => {
    const t = "- 01 garrafa para água, devidamente identificada com o nome completo do estudante e turma. - 01 pasta fichário ou catálogo com 50/100 saquinhos plásticos.";
    const [garrafa, pasta] = linha(t);
    expect([garrafa.quantidade, garrafa.descricao, garrafa.observacao]).toEqual([1, "garrafa para água", "devidamente identificada com o nome completo do estudante e turma"]);
    expect(pasta.alternativas).toEqual(["pasta fichário", "pasta catálogo com 50/100 saquinhos plásticos"]);
  });

  it("alternativa: cada opção inteira, para o cliente escolher", () => {
    expect(linha("01 lápis ou lapiseira")[0].alternativas).toEqual(["lápis", "lapiseira"]);
    expect(linha("1 caneta azul ou preta")[0].alternativas).toEqual(["caneta azul", "caneta preta"]);
    expect(linha("02 folhas de raio X ou 02 folhas acetato A4")[0].alternativas).toEqual(["folhas de raio X", "folhas acetato A4"]);
    // "ou similar" e "ou outra marca" não são escolha.
    expect(linha("3 blocos autoadesivos tipo post-it ou similar")[0].alternativas).toEqual([]);
  });

  it("exigência: \"PARA LÁPIS JUMBO\" sai da descrição e é cobrada do produto", () => {
    const [ap] = linha("01 apontador com depósito PARA LÁPIS JUMBO");
    expect([ap.descricao, ap.exigencia]).toEqual(["apontador com depósito", "para lápis jumbo"]);
    expect(atendeExigencia(ap.exigencia, "Apontador com depósito")).toBe(false);
    expect(atendeExigencia(ap.exigencia, "Apontador com depósito para lápis jumbo")).toBe(true);
    // Na comparação, o que a exigência cobra pesa: o apontador jumbo passa à frente do comum.
    const catalogo = [{ id: "1", nome: "Apontador com depósito" }, { id: "2", nome: "Apontador com depósito jumbo" }, { id: "3", nome: "Lápis grafite jumbo" }];
    expect(sugerir("apontador com depósito jumbo", catalogo)[0].nome).toBe("Apontador com depósito jumbo");
    // "garrafa para água" não é exigência: água não é um objeto de papelaria.
    expect(linha("01 garrafa para água")[0].exigencia).toBe("");
  });
});
