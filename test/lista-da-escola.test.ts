import { describe, expect, it } from "vitest";
import { NOTA_MINIMA, blocosDoRecado, emDuvida, lerLinhas, recadoComIndisponiveis, sugerir } from "@/lib/lista-da-escola";

const catalogo = ["Apontador com depósito", "Borracha branca", "Caderno brochura 96 folhas", "Caderno de desenho 48 folhas",
  "Caderno universitário 10 matérias", "Canetinha hidrográfica 12 cores", "Cola bastão 10 g", "Cola branca 90 g", "Estojo escolar",
  "Folha de EVA", "Giz de cera 12 cores", "Lápis de cor 24 cores", "Lápis grafite nº 2", "Papel sulfite A4, 100 folhas",
  "Régua 30 cm", "Tesoura sem ponta", "Tinta guache 6 cores"].map((nome, i) => ({ id: String(i), nome }));

// Uma lista como as escolas mandam: título, seção, marcadores variados,
// quantidade no começo, no fim e por extenso, e itens que a papelaria não vende.
const LISTA = `LISTA DE MATERIAL 2027 - 3º ANO
Material de uso individual:
- 02 cadernos brochura capa dura 96 fls (capa dura)
• 04 lápis pretos nº 2
1. 2 borrachas brancas macias
3 colas bastão grandes
Uma tesoura sem ponta com nome gravado
1 caixa de lápis de cor 24 cores
Canetinha hidrocor 12 cores
Régua de 30 cm - 1 unidade
1 dicionário Aurélio atualizado
1 avental de plástico para pintura`;

describe("leitura da lista da escola", () => {
  const linhas = lerLinhas(LISTA);

  it("separa quantidade, descrição e o que a escola pôs entre parênteses", () => {
    expect(linhas.map((l) => [l.quantidade, l.descricao, l.observacao, l.item])).toEqual([
      [1, "LISTA DE MATERIAL 2027 - 3º ANO", "", false],
      [1, "Material de uso individual", "", false],
      [2, "cadernos brochura capa dura 96 fls", "capa dura", true],
      [4, "lápis pretos nº 2", "", true],
      [2, "borrachas brancas macias", "", true],
      [3, "colas bastão grandes", "", true],
      [1, "tesoura sem ponta", "com nome gravado", true],
      [1, "caixa de lápis de cor 24 cores", "", true],
      [1, "Canetinha hidrocor 12 cores", "", true],
      [1, "Régua de 30 cm", "", true],
      [1, "dicionário Aurélio atualizado", "", false],
      [1, "avental de plástico para pintura", "", true],
    ]);
  });

  it("ignora linha sem palavra e aceita item separado por ponto e vírgula", () => {
    expect(lerLinhas("-----\n\n2 lápis; 1 borracha\n12345").map((l) => [l.quantidade, l.descricao])).toEqual([[2, "lápis"], [1, "borracha"]]);
  });
});

// O gargalo de 20/10/2026: recado, título, data e contato viravam "item
// indisponível", e lista em texto corrido, sem quantidade, não virava nada.
describe("item ou texto", () => {
  const itens = (t: string, vocabulario?: string[]) => lerLinhas(t, { vocabulario }).filter((l) => l.item).map((l) => [l.quantidade, l.descricao]);
  const textos = (t: string) => lerLinhas(t).filter((l) => !l.item).map((l) => l.original);

  const COMPLETA = `COLÉGIO SÃO JOSÉ
Rua das Flores, 120 · Centro · (11) 4002-8922 · secretaria@saojose.edu.br
LISTA DE MATERIAL ESCOLAR 2026
1º ANO - ENSINO FUNDAMENTAL I

MATERIAL DE USO INDIVIDUAL
- 04 cadernos brochura capa dura grande 96 folhas (sem espiral)
- 02 (dois) lápis grafite nº 2
- 01 tesoura sem ponta (com nome gravado)
Agenda do colégio

MATERIAL DE USO COLETIVO (entregar na primeira semana de aula)
- 500 folhas de papel sulfite
- 1 caixa de sapato encapada

LIVROS
- Ápis Língua Portuguesa 1º ano – Editora Ática

OBSERVAÇÕES:
• Todo material deverá ser identificado com o nome do aluno.
• Os livros serão utilizados a partir do primeiro dia de aula.
• Reunião de pais: 30/01/2026 às 19h.
Início das aulas: 02/02/2026
Atenciosamente, a Coordenação Pedagógica.`;

  it("só o material é item: cabeçalho, endereço, título, recado, data e despedida ficam fora", () => {
    expect(itens(COMPLETA)).toEqual([
      [4, "cadernos brochura capa dura grande 96 folhas"],
      [2, "lápis grafite nº 2"],
      [1, "tesoura sem ponta"],
      [1, "Agenda do colégio"],
      [1, "500 folhas de papel sulfite"],
      [1, "caixa de sapato encapada"],
    ]);
    expect(textos(COMPLETA)).toEqual([
      "COLÉGIO SÃO JOSÉ",
      "Rua das Flores, 120 · Centro · (11) 4002-8922 · secretaria@saojose.edu.br",
      "LISTA DE MATERIAL ESCOLAR 2026",
      "1º ANO - ENSINO FUNDAMENTAL I",
      "MATERIAL DE USO INDIVIDUAL",
      "MATERIAL DE USO COLETIVO (entregar na primeira semana de aula)",
      "LIVROS",
      "Ápis Língua Portuguesa 1º ano – Editora Ática",
      "OBSERVAÇÕES:",
      "Todo material deverá ser identificado com o nome do aluno.",
      "Os livros serão utilizados a partir do primeiro dia de aula.",
      "Reunião de pais: 30/01/2026 às 19h.",
      "Início das aulas: 02/02/2026",
      "Atenciosamente, a Coordenação Pedagógica.",
    ]);
  });

  it("lista em texto corrido, sem quantidade, vira um item por objeto", () => {
    const t = "Para o 3º ano, os alunos deverão trazer caderno universitário 10 matérias, lápis preto, borracha, régua de 30 cm e uma caixa de lápis de cor. Também solicitamos uma pasta com elástico e um tubo de cola branca.";
    expect(itens(t)).toEqual([
      [1, "caderno universitário 10 matérias"], [1, "lápis preto"], [1, "borracha"], [1, "régua de 30 cm"],
      [1, "caixa de lápis de cor"], [1, "pasta com elástico"], [1, "tubo de cola branca"],
    ]);
    expect(textos(t)).toEqual(["Para o 3º ano, os alunos deverão trazer", "Também solicitamos"]);
  });

  it("junta o parágrafo que o PDF quebrou no fim da linha", () => {
    const t = `Prezadas famílias, informamos que o material deverá ser entregue
na primeira semana de aula, devidamente identificado. Os alunos
precisarão de: caderno de caligrafia, lápis, borracha e uma
caixa de giz de cera.`;
    expect(itens(t)).toEqual([[1, "caderno de caligrafia"], [1, "lápis"], [1, "borracha"], [1, "caixa de giz de cera"]]);
    expect(textos(t)).toHaveLength(2);
  });

  it("mas não junta lista em minúsculas nem item com marcador", () => {
    expect(itens("caderno brochura\nlápis preto\nborracha branca")).toEqual([[1, "caderno brochura"], [1, "lápis preto"], [1, "borracha branca"]]);
    expect(itens("Lista de material – Educação Infantil – Maternal II\na) 1 pasta catálogo\nb) 2 potes de massinha")).toEqual([
      [1, "pasta catálogo"], [2, "potes de massinha"],
    ]);
  });

  it("vírgula e \"e\" dentro da descrição de UM item não quebram o item", () => {
    expect(itens("2 cadernos brochura, capa dura, 96 folhas")).toEqual([[2, "cadernos brochura, capa dura, 96 folhas"]]);
    expect(itens("Papel crepom azul e amarelo")).toEqual([[1, "Papel crepom azul e amarelo"]]);
    expect(itens("1 caixa de lápis de cor 24 + 6 tons (caras e cores)")).toEqual([[1, "caixa de lápis de cor 24 + 6 tons"]]);
    expect(itens("Caneta azul, caneta vermelha e marca-texto amarelo")).toEqual([[1, "Caneta azul"], [1, "caneta vermelha"], [1, "marca-texto amarelo"]]);
  });

  it("frase que começa pelo objeto mas é instrução fica fora", () => {
    // Só a fala de recado ("deve", "todos") separa estas de "Tesoura sem ponta".
    for (const t of ["A tesoura deve ter ponta arredondada.", "Todos os cadernos com capa plástica."]) {
      expect(itens(t), t).toEqual([]);
    }
  });

  it("verbo de recado depois de \"e\" não vira a etiqueta que se compra", () => {
    const t = "Os cadernos devem ser encapados com plástico transparente e etiquetados com o nome da criança.";
    expect(itens(t)).toEqual([]);
    expect(textos(t)).toEqual([t]);
  });

  it("número que não é quantidade: série, data, hora, medida e preço", () => {
    expect(itens("1º ano\n30/01 reunião\n500 folhas de papel sulfite\n1o. Ano Ensino Fundamental")).toEqual([
      [1, "500 folhas de papel sulfite"],
    ]);
    // Planilha com colunas de preço ao lado do item.
    expect(itens("1 tesoura escolar sem ponta com nome 8.6 8.6\n2 colas bastão R$ 4,50")).toEqual([
      [1, "tesoura escolar sem ponta"], [2, "colas bastão"],
    ]);
  });

  it("o catálogo da loja ensina o que é material: o que ela vende é item", () => {
    expect(itens("Bambolê")).toEqual([]);
    expect(itens("Bambolê", ["bambole"])).toEqual([[1, "Bambolê"]]);
  });

  it("lista toda em maiúsculas, sem quantidade, continua sendo lista", () => {
    expect(itens("MATERIAL DO 2º ANO\nCADERNO BROCHURA 96 FOLHAS\nTESOURA SEM PONTA")).toEqual([
      [1, "CADERNO BROCHURA 96 FOLHAS"], [1, "TESOURA SEM PONTA"],
    ]);
  });
});

describe("comparação com o catálogo", () => {
  it("acha no catálogo o produto certo para cada item que a papelaria vende", () => {
    const melhor = (d: string) => sugerir(d, catalogo)[0];
    const esperado: Record<string, string> = {
      "cadernos brochura capa dura 96 fls": "Caderno brochura 96 folhas",
      "lápis pretos nº 2": "Lápis grafite nº 2",
      "borrachas brancas macias": "Borracha branca",
      "colas bastão grandes": "Cola bastão 10 g",
      "tesoura sem ponta com nome gravado": "Tesoura sem ponta",
      "caixa de lápis de cor 24 cores": "Lápis de cor 24 cores",
      "Canetinha hidrocor 12 cores": "Canetinha hidrográfica 12 cores",
      "Régua de 30 cm": "Régua 30 cm",
    };
    for (const [linha, produto] of Object.entries(esperado)) {
      expect(melhor(linha)?.nome, linha).toBe(produto);
      expect(melhor(linha)!.pontos, linha).toBeGreaterThanOrEqual(NOTA_MINIMA);
    }
  });

  it("o que a papelaria não vende fica sem sugestão boa", () => {
    for (const d of ["dicionário Aurélio atualizado", "avental de plástico para pintura"]) {
      expect(sugerir(d, catalogo).every((s) => s.pontos < NOTA_MINIMA), d).toBe(true);
    }
  });

  it("número que contradiz pesa contra: 24 cores não vira o de 12", () => {
    const [a] = sugerir("lápis de cor 12 cores", [{ id: "1", nome: "Lápis de cor 24 cores" }, { id: "2", nome: "Lápis de cor 12 cores" }]);
    expect(a.nome).toBe("Lápis de cor 12 cores");
  });

  it("a escola escreve mais do que o catálogo, e isso não derruba a nota", () => {
    // Os dois casos que apareciam como "Confira" com 50% e 46%.
    const tesoura = sugerir("tesoura escolar sem ponta com nome", catalogo)[0];
    expect(tesoura.nome).toBe("Tesoura sem ponta");
    expect(tesoura.pontos).toBeGreaterThanOrEqual(0.6);
    const lapis = sugerir("caixa de lápis de cor 24 + 6 tons", catalogo)[0];
    expect(lapis.nome).toBe("Lápis de cor 24 cores");
    expect(lapis.pontos).toBeGreaterThanOrEqual(0.6);
  });

  it("e escreve menos: \"borracha\" é a única borracha da loja", () => {
    const s = sugerir("borracha", catalogo);
    expect(s[0].nome).toBe("Borracha branca");
    expect(emDuvida(s)).toBe(false);
  });

  it("mas \"cola\", com duas colas no catálogo, pede conferência em vez de adivinhar", () => {
    const s = sugerir("cola", catalogo);
    expect(s.slice(0, 2).map((x) => x.nome).sort()).toEqual(["Cola bastão 10 g", "Cola branca 90 g"]);
    expect(emDuvida(s)).toBe(true);
    expect(emDuvida(sugerir("cola bastão", catalogo))).toBe(false);
  });

  it("dez pontos de distância bastam, contados em centésimos e não em ponto flutuante", () => {
    const par = (a: number, b: number) => emDuvida([
      { produto_id: "a", nome: "A", pontos: a }, { produto_id: "b", nome: "B", pontos: b }]);
    // 1 - 0.9 é 0.0999… em ponto flutuante; 0.8 - 0.7 também.
    expect(par(1, 0.9)).toBe(false);
    expect(par(0.8, 0.7)).toBe(false);
    expect(par(1, 0.91)).toBe(true);
  });
});

describe("recado com o que falta", () => {
  it("junta o bloco ao recado e, importando de novo, troca o bloco em vez de repetir", () => {
    const um = recadoComIndisponiveis("Avental é comprado na escola.", ["Dicionário Aurélio"]);
    expect(um).toBe("Avental é comprado na escola.\n\nItens da lista da escola que não vendemos:\n• Dicionário Aurélio");
    const dois = recadoComIndisponiveis(um, ["Livro de inglês"]);
    expect(dois).toBe("Avental é comprado na escola.\n\nItens da lista da escola que não vendemos:\n• Livro de inglês");
    expect(recadoComIndisponiveis(dois, [])).toBe("Avental é comprado na escola.");
  });

  it("o cliente vê o recado em blocos: o parágrafo da papelaria e a lista do que não vendemos, um item por linha", () => {
    const recado = recadoComIndisponiveis("Avental é comprado na escola.\nEntregamos em 2 dias.", ["Dicionário Aurélio", "Jaleco"]);
    expect(blocosDoRecado(recado)).toEqual([
      { tipo: "texto", texto: "Avental é comprado na escola." },
      { tipo: "texto", texto: "Entregamos em 2 dias." },
      { tipo: "lista", titulo: "Itens da lista da escola que não vendemos:", itens: ["Dicionário Aurélio", "Jaleco"] },
    ]);
    // Lista digitada pela papelaria com hífen, sem título, também vira lista.
    expect(blocosDoRecado("- Agenda\n- Uniforme")).toEqual([{ tipo: "lista", titulo: null, itens: ["Agenda", "Uniforme"] }]);
  });
});
