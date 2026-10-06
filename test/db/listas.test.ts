import { afterAll, describe, expect, it } from "vitest";
import { emSandbox, encerrar, falha, outraPapelaria, trocarPara, voltarAoDono } from "./sessao";

afterAll(encerrar);

const SERIE_3_ANO = "40000000-0000-4000-8000-000000000003";
const LISTA_2027 = "50000000-0000-4000-8000-000000000003";
const LISTA_2026 = "50000000-0000-4000-8000-000000000103";

describe("publicar e encerrar lista", () => {
  it("publicar a de 2026 encerra a de 2027 na mesma série, numa transação", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userA);
      const r = await q(`select public.publicar_lista($1) as r`, [LISTA_2026]);
      expect(r.rows[0].r).toEqual({ lista_id: LISTA_2026, encerrou: LISTA_2027 });
      const st = await q(`select id, status, encerrada_em is not null as enc from public.lista where serie_id = $1 order by ano_letivo`, [SERIE_3_ANO]);
      expect(st.rows).toEqual([
        { id: LISTA_2026, status: "publicada", enc: false },
        { id: LISTA_2027, status: "encerrada", enc: true },
      ]);
    });
  });

  it("publicar o que já está publicado não muda nada", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userA);
      const r = await q(`select public.publicar_lista($1) as r`, [LISTA_2027]);
      expect(r.rows[0].r.encerrou).toBeNull();
    });
  });

  it("lista vazia não publica", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userA);
      const nova = await q<{ id: string }>(
        `insert into public.lista (fornecedor_id, serie_id, ano_letivo) values ('00000000-0000-4000-8000-000000000001', $1, 2028) returning id`,
        [SERIE_3_ANO],
      );
      expect(await falha(q, `select public.publicar_lista($1)`, [nova.rows[0].id])).toMatch(/^lista_vazia/);
    });
  });

  it("encerrar tira do ar; os pais deixam de ver", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userA);
      await q(`select public.encerrar_lista($1)`, [LISTA_2027]);
      await voltarAoDono(q);
      await trocarPara(q, "anon");
      const v = await q(`select public.vitrine_lista('papelaria-central', 'colegio-modelo', '3-ano') as v`);
      expect(v.rows[0].v).toBeNull();
    });
  });

  it("outra papelaria não publica nem encerra: a lista é invisível para ela", async () => {
    await emSandbox(async (q) => {
      const { userB } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userB);
      expect(await falha(q, `select public.publicar_lista($1)`, [LISTA_2026])).toMatch(/^lista_inexistente/);
      expect(await falha(q, `select public.encerrar_lista($1)`, [LISTA_2027])).toMatch(/^lista_inexistente/);
      await voltarAoDono(q);
      const st = await q(`select status from public.lista where id = $1`, [LISTA_2027]);
      expect(st.rows[0].status).toBe("publicada");
    });
  });

  it("o pai não chama nenhuma das duas", async () => {
    await emSandbox(async (q) => {
      await trocarPara(q, "anon");
      expect(await falha(q, `select public.publicar_lista($1)`, [LISTA_2026])).toMatch(/permission denied/);
      expect(await falha(q, `select public.encerrar_lista($1)`, [LISTA_2027])).toMatch(/permission denied/);
    });
  });
});
