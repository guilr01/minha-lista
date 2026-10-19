import { describe, expect, it } from "vitest";
import { NOTA_MINIMA, lerLinhas, recadoComIndisponiveis, sugerir } from "@/lib/lista-da-escola";

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
    expect(linhas.map((l) => [l.quantidade, l.descricao, l.observacao, l.cabecalho])).toEqual([
      [1, "LISTA DE MATERIAL 2027 - 3º ANO", "", true],
      [1, "Material de uso individual", "", true],
      [2, "cadernos brochura capa dura 96 fls", "capa dura", false],
      [4, "lápis pretos nº 2", "", false],
      [2, "borrachas brancas macias", "", false],
      [3, "colas bastão grandes", "", false],
      [1, "tesoura sem ponta com nome gravado", "", false],
      [1, "caixa de lápis de cor 24 cores", "", false],
      [1, "Canetinha hidrocor 12 cores", "", false],
      [1, "Régua de 30 cm", "", false],
      [1, "dicionário Aurélio atualizado", "", false],
      [1, "avental de plástico para pintura", "", false],
    ]);
  });

  it("ignora linha sem palavra e aceita item separado por ponto e vírgula", () => {
    expect(lerLinhas("-----\n\n2 lápis; 1 borracha\n12345").map((l) => [l.quantidade, l.descricao])).toEqual([[2, "lápis"], [1, "borracha"]]);
  });

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
});

describe("recado com o que falta", () => {
  it("junta o bloco ao recado e, importando de novo, troca o bloco em vez de repetir", () => {
    const um = recadoComIndisponiveis("Avental é comprado na escola.", ["Dicionário Aurélio"]);
    expect(um).toBe("Avental é comprado na escola.\n\nItens da lista da escola que não vendemos:\n• Dicionário Aurélio");
    const dois = recadoComIndisponiveis(um, ["Livro de inglês"]);
    expect(dois).toBe("Avental é comprado na escola.\n\nItens da lista da escola que não vendemos:\n• Livro de inglês");
    expect(recadoComIndisponiveis(dois, [])).toBe("Avental é comprado na escola.");
  });
});
