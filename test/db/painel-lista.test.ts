import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { PAPELARIA_CENTRAL } from "./sessao";
import { urlDoBanco } from "./setup-global";

// Passa pela consulta de verdade do painel (src/lib/painel.ts), pelo
// db.ts, contra o banco de teste. Foi aqui que o array de enum chegou como
// string e todo pedido aparecia como faixa "Mista".

let painel: typeof import("@/lib/painel");
let usuario: string;
const c = () => new pg.Client({ connectionString: urlDoBanco() });

beforeAll(async () => {
  process.env.DATABASE_URL = urlDoBanco();
  painel = await import("@/lib/painel");
  const db = c();
  await db.connect();
  const u = await db.query<{ id: string }>(
    `insert into app.usuario (email) values ('painel-${Date.now()}@exemplo.test') returning id`,
  );
  usuario = u.rows[0].id;
  await db.query(`insert into public.membro_fornecedor (fornecedor_id, user_id) values ($1, $2)`, [PAPELARIA_CENTRAL, usuario]);
  // Um pedido pago todo na Premium, com um item que caiu para a Intermediária.
  await db.query("begin");
  await db.query("set local role anon");
  const r = await db.query(`select public.criar_pedido($1) as r`, [JSON.stringify({
    lista_id: "50000000-0000-4000-8000-000000000001", faixa_base: "premium", metodo_pagamento: "pix",
    modalidade: "retirada", aluno_nome: "Lucas Lima", responsavel_nome: "Carlos Lima", responsavel_whatsapp: "21977776666",
    itens: [
      { produto_id: "10000000-0000-4000-8000-000000000006", faixa: "premium", quantidade: 2 },
      { produto_id: "10000000-0000-4000-8000-000000000021", faixa: "premium", quantidade: 1 },
    ],
  })]);
  await db.query("reset role");
  const token = r.rows[0].r.token as string;
  await db.query(`select app.registrar_cobranca($1, 'fake', 'pix', $2, 1, '{}')`, [token, "lista_" + token.slice(0, 10)]);
  await db.query(`select app.confirmar_pagamento('fake', $1, 'aprovado')`, ["lista_" + token.slice(0, 10)]);
  await db.query("commit");
  await db.end();
});

afterAll(async () => {
  await globalThis.__poolListaPronta?.end();
  globalThis.__poolListaPronta = undefined;
});

describe("lista de pedidos do painel", () => {
  it("devolve as faixas como array, e a faixa escolhida (não a substituta)", async () => {
    const lista = await painel.listarPedidos(usuario, PAPELARIA_CENTRAL);
    const p = lista.find((x) => x.aluno_nome === "Lucas Lima" && x.itens === 2);
    expect(p).toBeDefined();
    expect(Array.isArray(p!.faixas)).toBe(true);
    expect(p!.faixas).toEqual(["premium"]);
    expect(p).toMatchObject({ status: "pago", separados: 0 });
  });

  it("pedido aguardando pagamento não aparece no painel", async () => {
    const lista = await painel.listarPedidos(usuario, PAPELARIA_CENTRAL);
    expect(lista.every((x) => x.status !== "aguardando_pagamento")).toBe(true);
  });
});
