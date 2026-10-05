import { afterAll, describe, expect, it } from "vitest";
import { FAIXAS, opcaoResolvida, type Faixa } from "@/lib/faixa";
import { PAPELARIA_CENTRAL, emSandbox, encerrar } from "./sessao";

afterAll(encerrar);

// A regra da faixa existe em dois lugares: no banco (vale no pedido) e na
// tela (o total recalcula na hora). Se divergirem, o pai vê um total e paga
// outro. Este teste monta TODA combinação de faixas presentes e disponíveis
// e exige a mesma resposta dos dois.

describe("regra da faixa: banco e tela concordam", () => {
  it("em todas as 27 combinações de (sem opção · indisponível · disponível) × 3 faixas", async () => {
    await emSandbox(async (q) => {
      const estados = ["ausente", "indisponivel", "disponivel"] as const;
      let comparacoes = 0;
      for (const e0 of estados)
        for (const e1 of estados)
          for (const e2 of estados) {
            const prod = await q<{ id: string }>(
              `insert into public.produto (fornecedor_id, nome) values ($1, 'Combinação') returning id`,
              [PAPELARIA_CENTRAL],
            );
            const id = prod.rows[0].id;
            const disponiveis: { faixa: Faixa }[] = [];
            for (const [i, estado] of [e0, e1, e2].entries()) {
              if (estado === "ausente") continue;
              await q(
                `insert into public.produto_opcao (fornecedor_id, produto_id, faixa, marca, preco_centavos, disponivel)
                 values ($1, $2, $3, 'M', $4, $5)`,
                [PAPELARIA_CENTRAL, id, FAIXAS[i], 100 * (i + 1), estado === "disponivel"],
              );
              if (estado === "disponivel") disponiveis.push({ faixa: FAIXAS[i] });
            }
            for (const pedida of FAIXAS) {
              const r = await q<{ faixa: Faixa | null }>(
                `select (app.opcao_resolvida($1, $2)).faixa as faixa`,
                [id, pedida],
              );
              const tela = opcaoResolvida(disponiveis, pedida)?.faixa ?? null;
              expect(tela, `${[e0, e1, e2].join("/")} pedindo ${pedida}`).toBe(r.rows[0].faixa);
              comparacoes++;
            }
          }
      expect(comparacoes).toBe(81);
    });
  });
});
