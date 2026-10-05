import { afterAll, describe, expect, it } from "vitest";
import { PAPELARIA_CENTRAL, emSandbox, encerrar, falha, outraPapelaria, trocarPara, voltarAoDono, type Q } from "./sessao";

afterAll(encerrar);

const LISTA = "50000000-0000-4000-8000-000000000003";
const CADERNO = "10000000-0000-4000-8000-000000000001";
const LAPIS = "10000000-0000-4000-8000-000000000004";

/** Um pedido PAGO da Papelaria Central, com dois itens. */
async function pedidoPago(q: Q, modalidade: "entrega" | "retirada" = "retirada") {
  await trocarPara(q, "anon");
  const r = await q<{ r: { token: string } }>(`select public.criar_pedido($1) as r`, [JSON.stringify({
    lista_id: LISTA, faixa_base: "intermediaria", metodo_pagamento: "pix", modalidade,
    aluno_nome: "Pedro Souza", responsavel_nome: "Ana Souza", responsavel_whatsapp: "11988887777",
    endereco: modalidade === "entrega" ? { cep: "01310100", logradouro: "Av. Paulista", numero: "1" } : undefined,
    itens: [{ produto_id: CADERNO, quantidade: 2 }, { produto_id: LAPIS, quantidade: 6 }],
  })]);
  await voltarAoDono(q);
  const token = r.rows[0].r.token;
  await q(`select app.registrar_cobranca($1, 'fake', 'pix', $2, 1, '{}')`, [token, "t_" + token.slice(0, 8)]);
  await q(`select app.confirmar_pagamento('fake', $1, 'aprovado')`, ["t_" + token.slice(0, 8)]);
  const p = await q<{ id: string }>(`select id from public.pedido where token = $1`, [token]);
  const itens = await q<{ id: string }>(`select id from public.pedido_item where pedido_id = $1 order by ordem`, [p.rows[0].id]);
  return { pedido: p.rows[0].id, itens: itens.rows.map((i) => i.id) };
}

const status = async (q: Q, id: string) =>
  (await q<{ status: string }>(`select status from public.pedido where id = $1`, [id])).rows[0].status;

describe("painel: separação e status", () => {
  it("marcar o primeiro item inicia a separação e grava quem fez", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      const { pedido, itens } = await pedidoPago(q);
      await trocarPara(q, "authenticated", userA);
      const r = await q(`select public.marcar_item_separado($1, true) as r`, [itens[0]]);
      expect(r.rows[0].r).toMatchObject({ status: "em_separacao", mudou_status: true });
      await voltarAoDono(q);
      expect(await status(q, pedido)).toBe("em_separacao");
      const ev = await q(`select status_para, autor_id from public.pedido_evento where pedido_id = $1 order by id desc limit 1`, [pedido]);
      expect(ev.rows[0]).toEqual({ status_para: "em_separacao", autor_id: userA });
    });
  });

  it("não despacha com item faltando; com tudo separado, despacha", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      const { pedido, itens } = await pedidoPago(q, "entrega");
      await trocarPara(q, "authenticated", userA);
      await q(`select public.marcar_item_separado($1, true)`, [itens[0]]);
      expect(await falha(q, `select public.avancar_pedido($1, 'saiu_para_entrega')`, [pedido])).toMatch(/^separacao_incompleta: faltam 1/);
      await q(`select public.marcar_item_separado($1, true)`, [itens[1]]);
      await q(`select public.avancar_pedido($1, 'saiu_para_entrega')`, [pedido]);
      await q(`select public.avancar_pedido($1, 'entregue')`, [pedido]);
      await voltarAoDono(q);
      expect(await status(q, pedido)).toBe("entregue");
    });
  });

  it("transições fora de ordem ou da modalidade errada são recusadas", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      const { pedido, itens } = await pedidoPago(q, "retirada");
      await trocarPara(q, "authenticated", userA);
      expect(await falha(q, `select public.avancar_pedido($1, 'entregue')`, [pedido])).toMatch(/^transicao_invalida/);
      await q(`select public.avancar_pedido($1, 'em_separacao')`, [pedido]);
      for (const i of itens) await q(`select public.marcar_item_separado($1, true)`, [i]);
      // Retirada não "sai para entrega".
      expect(await falha(q, `select public.avancar_pedido($1, 'saiu_para_entrega')`, [pedido])).toMatch(/^transicao_invalida/);
      await q(`select public.avancar_pedido($1, 'pronto_para_retirada')`, [pedido]);
      // Despachado, o checklist trava.
      expect(await falha(q, `select public.marcar_item_separado($1, false)`, [itens[0]])).toMatch(/^separacao_encerrada/);
      expect(await falha(q, `select public.avancar_pedido($1, 'em_separacao')`, [pedido])).toMatch(/^transicao_invalida/);
    });
  });

  it("pedido não pago não entra na separação", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      await trocarPara(q, "anon");
      const r = await q<{ r: { token: string } }>(`select public.criar_pedido($1) as r`, [JSON.stringify({
        lista_id: LISTA, faixa_base: "economica", metodo_pagamento: "pix", modalidade: "retirada",
        aluno_nome: "Pedro Souza", responsavel_nome: "Ana Souza", responsavel_whatsapp: "11988887777",
        itens: [{ produto_id: CADERNO, quantidade: 1 }],
      })]);
      await voltarAoDono(q);
      const p = await q<{ id: string; item: string }>(`select p.id, i.id as item from public.pedido p join public.pedido_item i on i.pedido_id = p.id where p.token = $1`, [r.rows[0].r.token]);
      await trocarPara(q, "authenticated", userA);
      expect(await falha(q, `select public.marcar_item_separado($1, true)`, [p.rows[0].item])).toMatch(/^separacao_encerrada/);
      expect(await falha(q, `select public.avancar_pedido($1, 'em_separacao')`, [p.rows[0].id])).toMatch(/^transicao_invalida/);
    });
  });

  it("outra papelaria não toca no pedido: responde como se não existisse", async () => {
    await emSandbox(async (q) => {
      const { userB } = await outraPapelaria(q);
      const { pedido, itens } = await pedidoPago(q);
      await trocarPara(q, "authenticated", userB);
      expect(await falha(q, `select public.marcar_item_separado($1, true)`, [itens[0]])).toMatch(/^item_inexistente/);
      expect(await falha(q, `select public.avancar_pedido($1, 'em_separacao')`, [pedido])).toMatch(/^pedido_inexistente/);
      await voltarAoDono(q);
      expect(await status(q, pedido)).toBe("pago");
    });
  });

  it("o fornecedor não escreve mais direto no item; o pai não chama as funções", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      const { itens } = await pedidoPago(q);
      await trocarPara(q, "authenticated", userA);
      expect(await falha(q, `update public.pedido_item set separado = true where id = $1`, [itens[0]])).toMatch(/permission denied/);
      await voltarAoDono(q);
      await trocarPara(q, "anon");
      expect(await falha(q, `select public.marcar_item_separado($1, true)`, [itens[0]])).toMatch(/permission denied/);
      expect(await falha(q, `select public.avancar_pedido($1, 'em_separacao')`, [itens[0]])).toMatch(/permission denied/);
    });
  });

  it("a papelaria do seed segue intacta (sanidade do fixture)", async () => {
    await emSandbox(async (q) => {
      const r = await q(`select count(*)::int as n from public.fornecedor where id = $1`, [PAPELARIA_CENTRAL]);
      expect(r.rows[0].n).toBe(1);
    });
  });
});
