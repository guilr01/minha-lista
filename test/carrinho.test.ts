import { describe, expect, it } from "vitest";
import { faixaDoCarrinho, linhasValidas, produtosConhecidos, subtotal, type Linha } from "@/lib/carrinho";
import type { ItemDaLista } from "@/lib/vitrine";

const op = (faixa: "economica" | "intermediaria" | "premium", preco: number) => ({ id: faixa, faixa, marca: "M", descricao: null, preco_centavos: preco });
const itens: ItemDaLista[] = [
  { produto_id: "a", nome: "Caderno", categoria: null, unidade: "un", quantidade: 2, observacao: null, opcoes: [op("economica", 100), op("premium", 300)] },
  { produto_id: "b", nome: "Pincel", categoria: null, unidade: "un", quantidade: 1, observacao: null, opcoes: [op("economica", 50)] },
  { produto_id: "c", nome: "Esgotado", categoria: null, unidade: "un", quantidade: 1, observacao: null, opcoes: [] },
];
const produtos = produtosConhecidos(itens, []);

describe("carrinho", () => {
  it("item sem a faixa escolhida cai para a de baixo e não torna a lista mista", () => {
    const linhas: Linha[] = itens.map((i) => ({ produto_id: i.produto_id, faixa: "premium", quantidade: i.quantidade, removida: false }));
    expect(subtotal(linhas, produtos)).toBe(2 * 300 + 50);
    expect(faixaDoCarrinho(linhas, produtos)).toBe("premium");
  });

  it("trocar a faixa de um item torna a lista mista; item esgotado não entra", () => {
    const linhas: Linha[] = [
      { produto_id: "a", faixa: "economica", quantidade: 1, removida: false },
      { produto_id: "b", faixa: "premium", quantidade: 1, removida: false },
      { produto_id: "c", faixa: "premium", quantidade: 1, removida: false },
    ];
    expect(faixaDoCarrinho(linhas, produtos)).toBe("mista");
    expect(subtotal(linhas, produtos)).toBe(150);
  });

  it("o carrinho salvo no aparelho é filtrado contra o que a página conhece", () => {
    const salvo = [
      { produto_id: "a", faixa: "premium", quantidade: 3, removida: false },
      { produto_id: "a", faixa: "premium", quantidade: 1 },
      { produto_id: "sumiu", faixa: "premium", quantidade: 1 },
      { produto_id: "b", faixa: "luxo", quantidade: 1 },
      { produto_id: "b", faixa: "economica", quantidade: 500 },
    ];
    expect(linhasValidas(salvo, produtos)).toEqual([{ produto_id: "a", faixa: "premium", quantidade: 3, removida: false }]);
    expect(linhasValidas("lixo", produtos)).toBeNull();
  });
});
