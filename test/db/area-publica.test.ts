import { afterAll, describe, expect, it } from "vitest";
import { emSandbox, encerrar, falha, trocarPara, voltarAoDono, type Q } from "./sessao";

afterAll(encerrar);

const LISTA_3_ANO = "50000000-0000-4000-8000-000000000003";
const LISTA_1_ANO = "50000000-0000-4000-8000-000000000001";
const LISTA_3_ANO_2026 = "50000000-0000-4000-8000-000000000103";
const CADERNO = "10000000-0000-4000-8000-000000000001"; // 790 · 1490 · 2490
const LAPIS = "10000000-0000-4000-8000-000000000004"; // 120 · 250 · 490
const PINCEL = "10000000-0000-4000-8000-000000000021"; // 290 · 590 · (sem premium)
const EVA = "10000000-0000-4000-8000-000000000022"; // 150 · 250 · 450 indisponível
const REGUA = "10000000-0000-4000-8000-000000000016"; // fora da lista do 3º ano

type Item = { produto_id: string; faixa?: string; quantidade: number };

function pedido(itens: Item[], extra: Record<string, unknown> = {}) {
  return {
    lista_id: LISTA_3_ANO,
    faixa_base: "intermediaria",
    metodo_pagamento: "pix",
    modalidade: "retirada",
    aluno_nome: "Pedro Souza",
    responsavel_nome: "Ana Souza",
    responsavel_whatsapp: "(11) 98888-7777",
    itens,
    ...extra,
  };
}

async function criar(q: Q, p: unknown) {
  const r = await q<{ r: { token: string; numero: number; total_centavos: number; subtotal_centavos: number } }>(
    `select public.criar_pedido($1) as r`,
    [JSON.stringify(p)],
  );
  return r.rows[0].r;
}

async function comoPai(q: Q) {
  await trocarPara(q, "anon");
}

describe("vitrine", () => {
  it("a papelaria mostra as 2 escolas e as 4 séries com lista publicada", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await q(`select public.vitrine_papelaria('papelaria-central') as v`);
      const v = r.rows[0].v;
      expect(v.papelaria.nome).toBe("Papelaria Central");
      expect(v.escolas.map((e: { slug: string }) => e.slug)).toEqual(["colegio-modelo", "escola-horizonte"]);
      expect(v.escolas[0].series.map((s: { slug: string }) => s.slug)).toEqual(["1-ano", "3-ano"]);
      // O que é interno não sai: contador de pedidos, ids.
      expect(JSON.stringify(v)).not.toMatch(/proximo_numero|"id"/);
    });
  });

  it("slug inexistente devolve nulo", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await q(`select public.vitrine_papelaria('nao-existe') as v`);
      expect(r.rows[0].v).toBeNull();
    });
  });

  it("a lista da série vem com as opções disponíveis de cada item", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await q(`select public.vitrine_lista('papelaria-central', 'colegio-modelo', '1-ano') as v`);
      const v = r.rows[0].v;
      expect(v.lista.ano_letivo).toBe(2027);
      expect(v.itens).toHaveLength(9);
      const pincel = v.itens.find((i: { nome: string }) => i.nome.startsWith("Pincel"));
      expect(pincel.opcoes.map((o: { faixa: string }) => o.faixa)).toEqual(["economica", "intermediaria"]);
    });
  });

  it("lista encerrada não aparece, e a publicada do mesmo ano aparece no lugar", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await q(`select public.vitrine_lista('papelaria-central', 'colegio-modelo', '3-ano') as v`);
      expect(r.rows[0].v.lista.id).toBe(LISTA_3_ANO);
      expect(r.rows[0].v.lista.id).not.toBe(LISTA_3_ANO_2026);
    });
  });

  it("lista em rascunho não aparece para o pai", async () => {
    await emSandbox(async (q) => {
      await q(`update public.lista set status = 'rascunho' where id = $1`, [LISTA_1_ANO]);
      await comoPai(q);
      const r = await q(`select public.vitrine_lista('papelaria-central', 'colegio-modelo', '1-ano') as v`);
      expect(r.rows[0].v).toBeNull();
      const p = await q(`select public.vitrine_papelaria('papelaria-central') as v`);
      const modelo = p.rows[0].v.escolas.find((e: { slug: string }) => e.slug === "colegio-modelo");
      expect(modelo.series.map((s: { slug: string }) => s.slug)).toEqual(["3-ano"]);
    });
  });

  it("duas listas publicadas na mesma série são recusadas pelo banco", async () => {
    await emSandbox(async (q) => {
      const erro = await falha(q, `update public.lista set status = 'publicada' where id = $1`, [LISTA_3_ANO_2026]);
      expect(erro).toMatch(/lista_uma_publicada_por_serie/);
    });
  });

  it("o catálogo para adicionar item traz só produto com opção disponível", async () => {
    await emSandbox(async (q) => {
      await q(`update public.produto_opcao set disponivel = false where produto_id = $1`, [REGUA]);
      await comoPai(q);
      const r = await q(`select public.vitrine_catalogo('papelaria-central') as v`);
      const nomes = r.rows[0].v.map((p: { nome: string }) => p.nome);
      expect(nomes).toHaveLength(21);
      expect(nomes).not.toContain("Régua 30 cm");
    });
  });
});

describe("criar_pedido: o preço vem do banco", () => {
  it("calcula o total pelo catálogo e devolve o número e o token", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await criar(q, pedido([
        { produto_id: CADERNO, faixa: "intermediaria", quantidade: 4 },
        { produto_id: LAPIS, faixa: "economica", quantidade: 6 },
      ]));
      expect(r.subtotal_centavos).toBe(4 * 1490 + 6 * 120);
      expect(r.total_centavos).toBe(r.subtotal_centavos);
      expect(r.numero).toBe(1001);
      expect(r.token).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("preço enviado pelo navegador é ignorado", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await criar(q, pedido([
        { produto_id: CADERNO, faixa: "premium", quantidade: 1, preco_centavos: 1 } as Item,
      ], { total_centavos: 1 }));
      expect(r.total_centavos).toBe(2490);
    });
  });

  it("entrega soma a taxa da papelaria e exige endereço", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const itens = [{ produto_id: CADERNO, quantidade: 1 }];
      const semEndereco = await falha(q, `select public.criar_pedido($1)`, [JSON.stringify(pedido(itens, { modalidade: "entrega" }))]);
      expect(semEndereco).toMatch(/^dados_invalidos: endereço/);
      const r = await criar(q, pedido(itens, {
        modalidade: "entrega",
        endereco: { cep: "01310-100", logradouro: "Av. Paulista", numero: "1000" },
      }));
      expect(r.total_centavos).toBe(1490 + 1000);
    });
  });

  it("item sem a faixa pedida cai para a mais próxima abaixo, e o pedido registra", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await criar(q, pedido([
        { produto_id: PINCEL, faixa: "premium", quantidade: 1 },
        { produto_id: EVA, faixa: "premium", quantidade: 2 },
      ], { lista_id: LISTA_1_ANO, faixa_base: "premium" }));
      expect(r.subtotal_centavos).toBe(590 + 2 * 250);
      await voltarAoDono(q);
      const itens = await q(`
        select i.nome_produto, i.faixa, i.faixa_pedida from public.pedido_item i
        join public.pedido p on p.id = i.pedido_id where p.token = $1 order by i.ordem`, [r.token]);
      expect(itens.rows.map((i) => [i.faixa, i.faixa_pedida])).toEqual([
        ["intermediaria", "premium"],
        ["intermediaria", "premium"],
      ]);
    });
  });

  it("item fora da lista entra como adicionado; o da lista guarda o que a escola pediu", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await criar(q, pedido([
        { produto_id: CADERNO, quantidade: 2 },
        { produto_id: REGUA, quantidade: 1 },
      ]));
      await voltarAoDono(q);
      const itens = await q(`
        select i.origem, i.quantidade, i.quantidade_lista from public.pedido_item i
        join public.pedido p on p.id = i.pedido_id where p.token = $1 order by i.ordem`, [r.token]);
      expect(itens.rows).toEqual([
        { origem: "lista", quantidade: 2, quantidade_lista: 4 },
        { origem: "adicionado", quantidade: 1, quantidade_lista: 0 },
      ]);
    });
  });

  it("recusa lista que não está publicada", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const erro = await falha(q, `select public.criar_pedido($1)`, [
        JSON.stringify(pedido([{ produto_id: CADERNO, quantidade: 1 }], { lista_id: LISTA_3_ANO_2026 })),
      ]);
      expect(erro).toMatch(/^lista_indisponivel/);
    });
  });

  it("recusa produto de outra papelaria", async () => {
    await emSandbox(async (q) => {
      const p = await q<{ id: string }>(`
        with f as (insert into public.fornecedor (nome, slug) values ('Rival', 'rival') returning id)
        insert into public.produto (fornecedor_id, nome) select id, 'Caderno rival' from f returning id`);
      await q(`insert into public.produto_opcao (fornecedor_id, produto_id, faixa, marca, preco_centavos)
               select fornecedor_id, id, 'economica', 'X', 100 from public.produto where id = $1`, [p.rows[0].id]);
      await comoPai(q);
      const erro = await falha(q, `select public.criar_pedido($1)`, [
        JSON.stringify(pedido([{ produto_id: p.rows[0].id, quantidade: 1 }])),
      ]);
      expect(erro).toMatch(/^item_indisponivel/);
    });
  });

  it("recusa pedido vazio, quantidade fora de 1 a 99, produto repetido e WhatsApp curto", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const casos: [unknown, RegExp][] = [
        [pedido([]), /^pedido_vazio/],
        [pedido([{ produto_id: CADERNO, quantidade: 0 }]), /^entrada_invalida: quantidade/],
        [pedido([{ produto_id: CADERNO, quantidade: 100 }]), /^entrada_invalida: quantidade/],
        [pedido([{ produto_id: CADERNO, quantidade: 1 }, { produto_id: CADERNO, quantidade: 1 }]), /repetido/],
        [pedido([{ produto_id: CADERNO, quantidade: 1 }], { responsavel_whatsapp: "9999" }), /WhatsApp/],
        [pedido([{ produto_id: CADERNO, faixa: "luxo", quantidade: 1 }]), /faixa desconhecida/],
      ];
      for (const [entrada, esperado] of casos) {
        expect(await falha(q, `select public.criar_pedido($1)`, [JSON.stringify(entrada)])).toMatch(esperado);
      }
    });
  });

  it("os números seguem em sequência por papelaria", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const a = await criar(q, pedido([{ produto_id: CADERNO, quantidade: 1 }]));
      const b = await criar(q, pedido([{ produto_id: CADERNO, quantidade: 1 }]));
      expect(b.numero).toBe(a.numero + 1);
    });
  });
});

describe("o pedido é congelado na compra", () => {
  it("mudar o preço no catálogo não altera o pedido feito", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await criar(q, pedido([{ produto_id: CADERNO, faixa: "intermediaria", quantidade: 4 }]));
      await voltarAoDono(q);
      await q(`update public.produto_opcao set preco_centavos = 9990, marca = 'Outra' where produto_id = $1`, [CADERNO]);
      await q(`update public.produto set nome = 'Caderno renomeado' where id = $1`, [CADERNO]);
      await comoPai(q);
      const p = (await q(`select public.pedido_por_token($1) as p`, [r.token])).rows[0].p;
      expect(p.total_centavos).toBe(4 * 1490);
      expect(p.itens[0]).toMatchObject({ nome: "Caderno brochura 96 folhas", marca: "Tilibra", preco_unitario_centavos: 1490 });
    });
  });

  it("nem o dono do banco altera preço, quantidade ou total depois", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await criar(q, pedido([{ produto_id: CADERNO, quantidade: 1 }]));
      await voltarAoDono(q);
      expect(await falha(q, `update public.pedido_item set preco_unitario_centavos = 1
        where pedido_id = (select id from public.pedido where token = $1)`, [r.token])).toMatch(/congelado/);
      expect(await falha(q, `update public.pedido_item set quantidade = 9
        where pedido_id = (select id from public.pedido where token = $1)`, [r.token])).toMatch(/congelado/);
      expect(await falha(q, `update public.pedido set total_centavos = 1, subtotal_centavos = 1
        where token = $1`, [r.token])).toMatch(/congelado/);
      // O checklist de separação e o status, sim.
      await q(`update public.pedido_item set separado = true, separado_em = now()
        where pedido_id = (select id from public.pedido where token = $1)`, [r.token]);
      await q(`update public.pedido set status = 'pago', pago_em = now() where token = $1`, [r.token]);
    });
  });

  it("apagar o produto do catálogo não apaga o item do pedido", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      // O EVA não está em lista nenhuma: pode sair do catálogo.
      const r = await criar(q, pedido([{ produto_id: EVA, quantidade: 1 }]));
      await voltarAoDono(q);
      await q(`delete from public.produto where id = $1`, [EVA]);
      const i = await q(`select nome_produto, produto_id, opcao_id from public.pedido_item
        where pedido_id = (select id from public.pedido where token = $1)`, [r.token]);
      expect(i.rows).toEqual([{ nome_produto: "Folha de EVA", produto_id: null, opcao_id: null }]);
    });
  });

  it("produto que está numa lista não sai do catálogo", async () => {
    await emSandbox(async (q) => {
      expect(await falha(q, `delete from public.produto where id = $1`, [REGUA])).toMatch(/lista_item/);
    });
  });

  it("a trilha de status é somente inserção", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      await criar(q, pedido([{ produto_id: CADERNO, quantidade: 1 }]));
      await voltarAoDono(q);
      expect(await falha(q, `update public.pedido_evento set status_para = 'entregue'`)).toMatch(/somente inserção/);
      expect(await falha(q, `delete from public.pedido_evento`)).toMatch(/somente inserção/);
    });
  });
});

describe("acompanhamento por token", () => {
  it("o pai lê o pedido pelo token, com itens e a linha do tempo", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await criar(q, pedido([{ produto_id: CADERNO, quantidade: 2 }]));
      const p = (await q(`select public.pedido_por_token($1) as p`, [r.token])).rows[0].p;
      expect(p.numero).toBe(r.numero);
      expect(p.status).toBe("aguardando_pagamento");
      expect(p.itens).toHaveLength(1);
      expect(p.eventos.map((e: { status: string }) => e.status)).toEqual(["aguardando_pagamento"]);
      expect(p.papelaria.nome).toBe("Papelaria Central");
      expect(JSON.stringify(p)).not.toContain(r.token);
    });
  });

  it("token desconhecido devolve nulo", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const p = (await q(`select public.pedido_por_token($1) as p`, ["0".repeat(64)])).rows[0].p;
      expect(p).toBeNull();
    });
  });

  it("Pix não pago aparece como expirado depois de 30 minutos", async () => {
    await emSandbox(async (q) => {
      await comoPai(q);
      const r = await criar(q, pedido([{ produto_id: CADERNO, quantidade: 1 }]));
      await voltarAoDono(q);
      await q(`update public.pedido set expira_em = now() - interval '1 minute' where token = $1`, [r.token]);
      const p = (await q(`select public.pedido_por_token($1) as p`, [r.token])).rows[0].p;
      expect(p.status).toBe("expirado");
    });
  });
});
