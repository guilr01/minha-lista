import { afterAll, describe, expect, it } from "vitest";
import {
  PAPELARIA_CENTRAL,
  emSandbox,
  encerrar,
  falha,
  outraPapelaria,
  trocarPara,
  voltarAoDono,
} from "./sessao";

afterAll(encerrar);

// Toda tabela de domínio, e a coluna que diz de quem ela é.
const TABELAS: Record<string, string> = {
  fornecedor: "id",
  membro_fornecedor: "fornecedor_id",
  produto: "fornecedor_id",
  produto_opcao: "fornecedor_id",
  escola: "fornecedor_id",
  serie: "fornecedor_id",
  lista: "fornecedor_id",
  lista_item: "fornecedor_id",
  pedido: "fornecedor_id",
  pedido_item: "fornecedor_id",
  pagamento: "fornecedor_id",
  pedido_evento: "fornecedor_id",
};

describe("o catálogo do banco confere com a lista acima", () => {
  it("toda tabela de public está na lista, tem RLS ligado e forçado", async () => {
    await emSandbox(async (q) => {
      const r = await q<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
        select c.relname, c.relrowsecurity, c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`);
      // Tabela nova fora de TABELAS é tabela que ninguém verificou.
      expect(r.rows.map((x) => x.relname).sort()).toEqual(Object.keys(TABELAS).sort());
      for (const t of r.rows) {
        expect(t.relrowsecurity, `${t.relname} sem RLS`).toBe(true);
        expect(t.relforcerowsecurity, `${t.relname} sem FORCE RLS`).toBe(true);
      }
    });
  });

  it("anon não tem privilégio em tabela nenhuma de public", async () => {
    await emSandbox(async (q) => {
      const r = await q(`
        select table_name, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'anon'`);
      expect(r.rows).toEqual([]);
    });
  });

  it("anon só executa as funções públicas declaradas", async () => {
    await emSandbox(async (q) => {
      const r = await q<{ proname: string }>(`
        select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app')
          and has_function_privilege('anon', p.oid, 'execute')
        order by 1`);
      expect(r.rows.map((x) => x.proname)).toEqual([
        "criar_pedido",
        "pedido_por_token",
        "vitrine_catalogo",
        "vitrine_lista",
        "vitrine_papelaria",
      ]);
    });
  });
});

describe("duas papelarias, nenhuma consulta atravessa", () => {
  it("cada fornecedor lê só o que é seu, em todas as tabelas", async () => {
    await emSandbox(async (q) => {
      const { userA, userB, fornB } = await outraPapelaria(q);
      // Um pedido em cada papelaria, para as tabelas de pedido não estarem vazias.
      await q(`select public.criar_pedido($1)`, [pedidoMinimo("50000000-0000-4000-8000-000000000003")]);

      for (const [usuario, dono] of [
        [userA, PAPELARIA_CENTRAL],
        [userB, fornB],
      ]) {
        await trocarPara(q, "authenticated", usuario);
        for (const [tabela, coluna] of Object.entries(TABELAS)) {
          const r = await q<{ dono: string }>(`select distinct ${coluna}::text as dono from public.${tabela}`);
          for (const linha of r.rows) {
            expect(linha.dono, `${tabela} vazou para ${usuario}`).toBe(dono);
          }
        }
        await voltarAoDono(q);
      }
    });
  });

  it("A vê os próprios dados (o teste acima não passa por estar tudo vazio)", async () => {
    await emSandbox(async (q) => {
      const { userA } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userA);
      const r = await q<{ n: number }>(`select count(*)::int as n from public.produto`);
      expect(r.rows[0].n).toBe(22);
    });
  });

  it("A não escreve na papelaria de B, nem com o id dela", async () => {
    await emSandbox(async (q) => {
      const { userA, fornB, produtoB } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userA);

      const insercao = await falha(
        q,
        `insert into public.produto (fornecedor_id, nome) values ($1, 'Intruso')`,
        [fornB],
      );
      expect(insercao).toMatch(/row-level security/);

      // RLS não ERRA no update: não encontra a linha. Zero linhas é a recusa.
      const upd = await q(`update public.produto set nome = 'Alterado' where id = $1`, [produtoB]);
      expect(upd.rowCount).toBe(0);
      const del = await q(`delete from public.produto where id = $1`, [produtoB]);
      expect(del.rowCount).toBe(0);
      const forn = await q(`update public.fornecedor set nome = 'Tomada' where id = $1`, [fornB]);
      expect(forn.rowCount).toBe(0);
    });
  });

  it("A não põe produto de B na própria lista (chave composta)", async () => {
    await emSandbox(async (q) => {
      const { userA, produtoB } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userA);
      const erro = await falha(
        q,
        `insert into public.lista_item (fornecedor_id, lista_id, produto_id, quantidade)
         values ($1, '50000000-0000-4000-8000-000000000003', $2, 1)`,
        [PAPELARIA_CENTRAL, produtoB],
      );
      expect(erro).toMatch(/foreign key|violates/);
    });
  });

  it("usuário sem papelaria não vê nada", async () => {
    await emSandbox(async (q) => {
      await q(`insert into auth.users (id, email) values ('99999999-0000-4000-8000-000000000009', 'x@exemplo.test')`);
      await trocarPara(q, "authenticated", "99999999-0000-4000-8000-000000000009");
      for (const tabela of Object.keys(TABELAS)) {
        const r = await q<{ n: number }>(`select count(*)::int as n from public.${tabela}`);
        expect(r.rows[0].n, tabela).toBe(0);
      }
    });
  });

  it("ninguém se põe de membro de outra papelaria", async () => {
    await emSandbox(async (q) => {
      const { userA, fornB } = await outraPapelaria(q);
      await trocarPara(q, "authenticated", userA);
      const erro = await falha(
        q,
        `insert into public.membro_fornecedor (fornecedor_id, user_id) values ($1, $2)`,
        [fornB, userA],
      );
      expect(erro).toMatch(/permission denied/);
    });
  });
});

describe("o pai, sem conta, não lê tabela", () => {
  it("anon recebe permissão negada em todas", async () => {
    await emSandbox(async (q) => {
      await trocarPara(q, "anon");
      for (const tabela of Object.keys(TABELAS)) {
        expect(await falha(q, `select 1 from public.${tabela} limit 1`)).toMatch(/permission denied/);
      }
    });
  });
});

function pedidoMinimo(listaId: string) {
  return JSON.stringify({
    lista_id: listaId,
    faixa_base: "intermediaria",
    metodo_pagamento: "pix",
    modalidade: "retirada",
    aluno_nome: "Pedro Souza",
    responsavel_nome: "Ana Souza",
    responsavel_whatsapp: "(11) 98888-7777",
    itens: [{ produto_id: "10000000-0000-4000-8000-000000000001", faixa: "intermediaria", quantidade: 4 }],
  });
}
