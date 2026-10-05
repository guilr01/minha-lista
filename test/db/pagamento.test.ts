import { afterAll, describe, expect, it } from "vitest";
import { emSandbox, encerrar, falha, trocarPara, voltarAoDono, type Q } from "./sessao";

afterAll(encerrar);

const LISTA = "50000000-0000-4000-8000-000000000003";
const CADERNO = "10000000-0000-4000-8000-000000000001";

async function novoPedido(q: Q, extra: Record<string, unknown> = {}) {
  await trocarPara(q, "anon");
  const r = await q<{ r: { token: string } }>(`select public.criar_pedido($1) as r`, [JSON.stringify({
    lista_id: LISTA, faixa_base: "intermediaria", metodo_pagamento: "pix", modalidade: "retirada",
    aluno_nome: "Pedro Souza", responsavel_nome: "Ana Souza", responsavel_whatsapp: "11988887777",
    itens: [{ produto_id: CADERNO, quantidade: 2 }], ...extra,
  })]);
  await voltarAoDono(q);
  return r.rows[0].r.token;
}

const registrar = (q: Q, token: string, id: string, metodo = "pix") =>
  q(`select app.registrar_cobranca($1, 'fake', $2, $3, 1, '{"copiaECola":"x"}')`, [token, metodo, id]);
const confirmar = (q: Q, id: string, status: string) =>
  q<{ r: { status: string; mudou: boolean } }>(`select app.confirmar_pagamento('fake', $1, $2) as r`, [id, status]);

describe("pagamento", () => {
  it("cobrança registrada com o valor do pedido, e a aprovação muda o status", async () => {
    await emSandbox(async (q) => {
      const token = await novoPedido(q);
      await registrar(q, token, "fake_1");
      const pg = await q(`select valor_centavos, status from public.pagamento where id_externo = 'fake_1'`);
      expect(pg.rows[0]).toEqual({ valor_centavos: 2 * 1490, status: "pendente" });

      const r = await confirmar(q, "fake_1", "aprovado");
      expect(r.rows[0].r).toMatchObject({ status: "pago", mudou: true });
      const p = (await q(`select public.pedido_por_token($1) as p`, [token])).rows[0].p;
      expect(p.status).toBe("pago");
      expect(p.pago_em).not.toBeNull();
      expect(p.eventos.map((e: { status: string }) => e.status)).toEqual(["aguardando_pagamento", "pago"]);
    });
  });

  it("o mesmo aviso duas vezes não gera dois eventos (webhook repetido)", async () => {
    await emSandbox(async (q) => {
      const token = await novoPedido(q);
      await registrar(q, token, "fake_2");
      await confirmar(q, "fake_2", "aprovado");
      const segunda = await confirmar(q, "fake_2", "aprovado");
      expect(segunda.rows[0].r.mudou).toBe(false);
      const n = await q(`select count(*)::int as n from public.pedido_evento e
        join public.pedido p on p.id = e.pedido_id where p.token = $1`, [token]);
      expect(n.rows[0].n).toBe(2);
    });
  });

  it("cartão recusado deixa o pedido aguardando", async () => {
    await emSandbox(async (q) => {
      const token = await novoPedido(q, { metodo_pagamento: "cartao", parcelas: 3 });
      await registrar(q, token, "fake_3", "cartao");
      const r = await confirmar(q, "fake_3", "recusado");
      expect(r.rows[0].r).toMatchObject({ status: "aguardando_pagamento", mudou: false });
    });
  });

  it("pagamento que chega depois de o Pix expirar na tela ainda vale", async () => {
    await emSandbox(async (q) => {
      const token = await novoPedido(q);
      await registrar(q, token, "fake_4");
      await q(`update public.pedido set expira_em = now() - interval '1 hour' where token = $1`, [token]);
      const r = await confirmar(q, "fake_4", "aprovado");
      expect(r.rows[0].r.status).toBe("pago");
    });
  });

  it("não registra cobrança de pedido já pago, nem com outro método", async () => {
    await emSandbox(async (q) => {
      const token = await novoPedido(q);
      expect(await falha(q, `select app.registrar_cobranca($1, 'fake', 'cartao', 'x', 1, '{}')`, [token])).toMatch(/metodo_divergente/);
      await registrar(q, token, "fake_5");
      await confirmar(q, "fake_5", "aprovado");
      expect(await falha(q, `select app.registrar_cobranca($1, 'fake', 'pix', 'y', 1, '{}')`, [token])).toMatch(/nao_aguarda/);
    });
  });

  it("nem o pai nem a papelaria executam as funções de pagamento", async () => {
    await emSandbox(async (q) => {
      for (const papel of ["anon", "authenticated"] as const) {
        await trocarPara(q, papel, papel === "authenticated" ? "00000000-0000-4000-8000-0000000000aa" : undefined);
        expect(await falha(q, `select app.confirmar_pagamento('fake', 'x', 'aprovado')`)).toMatch(/permission denied/);
        expect(await falha(q, `select app.registrar_cobranca('x', 'fake', 'pix', 'x', 1, '{}')`)).toMatch(/permission denied/);
        await voltarAoDono(q);
      }
    });
  });

  it("parcelas: acima do limite da papelaria é recusado; no Pix é sempre 1", async () => {
    await emSandbox(async (q) => {
      await trocarPara(q, "anon");
      const base = { lista_id: LISTA, faixa_base: "intermediaria", modalidade: "retirada", aluno_nome: "Pedro Souza",
        responsavel_nome: "Ana Souza", responsavel_whatsapp: "11988887777", itens: [{ produto_id: CADERNO, quantidade: 1 }] };
      expect(await falha(q, `select public.criar_pedido($1)`, [JSON.stringify({ ...base, metodo_pagamento: "cartao", parcelas: 4 })]))
        .toMatch(/até 3 parcelas/);
      const r = await q(`select public.criar_pedido($1) as r`, [JSON.stringify({ ...base, metodo_pagamento: "pix", parcelas: 3 })]);
      const p = (await q(`select public.pedido_por_token($1) as p`, [r.rows[0].r.token])).rows[0].p;
      expect(p.parcelas).toBe(1);
    });
  });
});
