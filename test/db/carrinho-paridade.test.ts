import { afterAll, describe, expect, it } from "vitest";
import {
  itensParaPedido,
  linhasDaLista,
  produtosConhecidos,
  subtotal,
  totalNaFaixa,
  type Linha,
} from "@/lib/carrinho";
import { FAIXAS, type Faixa } from "@/lib/faixa";
import type { ProdutoDoCatalogo, VitrineLista } from "@/lib/vitrine";
import { emSandbox, encerrar, falha, trocarPara, type Q } from "./sessao";

afterAll(encerrar);

// O total que a tela mostra precisa ser o total que o banco cobra. A tela
// calcula com src/lib/carrinho.ts; o banco, dentro de criar_pedido. Aqui as
// duas contas se encontram: criar_pedido recebe o total da tela como
// total_esperado_centavos e RECUSA se for outro.

const SERIES = [
  ["colegio-modelo", "1-ano"],
  ["colegio-modelo", "3-ano"],
  ["escola-horizonte", "2-ano"],
  ["escola-horizonte", "5-ano"],
] as const;

async function dados(q: Q, escola: string, serie: string) {
  const v = (await q<{ v: VitrineLista }>(`select public.vitrine_lista('papelaria-central', $1, $2) as v`, [escola, serie])).rows[0].v;
  const c = (await q<{ v: ProdutoDoCatalogo[] }>(`select public.vitrine_catalogo('papelaria-central') as v`)).rows[0].v;
  return { v, c, produtos: produtosConhecidos(v.itens, c) };
}

function pedido(v: VitrineLista, linhas: Linha[], produtos: ReturnType<typeof produtosConhecidos>, faixa: Faixa, total: number) {
  return JSON.stringify({
    lista_id: v.lista.id, faixa_base: faixa, metodo_pagamento: "pix", modalidade: "retirada",
    aluno_nome: "Pedro Souza", responsavel_nome: "Ana Souza", responsavel_whatsapp: "11988887777",
    itens: itensParaPedido(linhas, produtos), total_esperado_centavos: total,
  });
}

// Gerador determinístico: a mesma semente produz os mesmos carrinhos.
function sorteador(semente: number) {
  let x = semente;
  return (n: number) => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x % n;
  };
}

describe("carrinho da tela × criar_pedido", () => {
  it("lista inteira, nas três faixas, nas quatro séries", async () => {
    await emSandbox(async (q) => {
      await trocarPara(q, "anon");
      for (const [escola, serie] of SERIES) {
        const { v, produtos } = await dados(q, escola, serie);
        for (const f of FAIXAS) {
          const linhas = linhasDaLista(v.itens, f);
          expect(totalNaFaixa(linhas, produtos, f)).toBe(subtotal(linhas, produtos));
          const total = subtotal(linhas, produtos);
          const r = await q(`select public.criar_pedido($1) as r`, [pedido(v, linhas, produtos, f, total)]);
          expect(r.rows[0].r.total_centavos, `${serie} ${f}`).toBe(total);
        }
      }
    });
  });

  it("200 carrinhos alterados ao acaso: remover, trocar faixa, mudar quantidade, adicionar", async () => {
    await emSandbox(async (q) => {
      await trocarPara(q, "anon");
      const sortear = sorteador(42);
      let feitos = 0;
      for (let rodada = 0; rodada < 50; rodada++) {
        for (const [escola, serie] of SERIES) {
          const { v, c, produtos } = await dados(q, escola, serie);
          const base = FAIXAS[sortear(3)];
          const linhas: Linha[] = linhasDaLista(v.itens, base).map((l) => ({
            ...l,
            faixa: sortear(3) === 0 ? FAIXAS[sortear(3)] : l.faixa,
            quantidade: sortear(4) === 0 ? 1 + sortear(99) : l.quantidade,
            removida: sortear(5) === 0,
          }));
          for (const extra of c.filter((p) => !linhas.some((l) => l.produto_id === p.produto_id))) {
            if (sortear(6) === 0) linhas.push({ produto_id: extra.produto_id, faixa: FAIXAS[sortear(3)], quantidade: 1 + sortear(5), removida: false });
          }
          if (itensParaPedido(linhas, produtos).length === 0) continue;
          const total = subtotal(linhas, produtos);
          const r = await q(`select public.criar_pedido($1) as r`, [pedido(v, linhas, produtos, base, total)]);
          expect(r.rows[0].r.total_centavos).toBe(total);
          feitos++;
        }
      }
      expect(feitos).toBeGreaterThan(190);
    });
  });

  it("se o preço mudou depois que a página abriu, o banco recusa em vez de cobrar outro valor", async () => {
    await emSandbox(async (q) => {
      await trocarPara(q, "anon");
      const { v, produtos } = await dados(q, "colegio-modelo", "3-ano");
      const linhas = linhasDaLista(v.itens, "intermediaria");
      const totalDaTela = subtotal(linhas, produtos);
      await q("reset role");
      await q(`update public.produto_opcao set preco_centavos = preco_centavos + 100 where faixa = 'intermediaria'`);
      await trocarPara(q, "anon");
      const erro = await falha(q, `select public.criar_pedido($1)`, [pedido(v, linhas, produtos, "intermediaria", totalDaTela)]);
      expect(erro).toMatch(/^preco_mudou/);
    });
  });
});
