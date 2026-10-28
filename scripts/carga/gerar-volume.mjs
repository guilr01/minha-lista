// Monta um banco com volume de safra para medir onde o sistema cede.
//
//   node scripts/carga/gerar-volume.mjs            (padrões abaixo)
//   PAPELARIAS=50 PEDIDOS=200 node scripts/carga/gerar-volume.mjs
//
// SÓ roda num Postgres LOCAL, num banco chamado lista_pronta_carga, que ele
// apaga e recria a cada vez: nunca no de desenvolvimento, nunca no Neon. A
// URL vem de CARGA_ADMIN_URL (usuário que pode criar banco, padrão o
// postgres local) e o dono do banco é lp_dono, o mesmo papel sem superusuário
// dos testes, para o RLS valer como em produção.
//
// A papelaria 1 é a "gigante" (slug `gigante`): muito mais escolas, produtos e
// pedidos que as outras, porque toda consulta do sistema filtra por papelaria
// e é o volume DE UMA papelaria que pesa na tela dela. As outras dão o volume
// da plataforma inteira, que pesa no tamanho do banco e na altura dos índices.
// No fim imprime o tamanho por tabela e os bytes por pedido.
import pg from "pg";
import { migrar, semear } from "../banco.mjs";

const n = (nome, padrao) => Number(process.env[nome] ?? padrao);
const P = {
  papelarias: n("PAPELARIAS", 300),
  pedidos: n("PEDIDOS", 500), // por papelaria comum
  gigantePedidos: n("GIGANTE_PEDIDOS", 30000),
  produtos: n("PRODUTOS", 150),
  giganteProdutos: n("GIGANTE_PRODUTOS", 600),
  escolas: n("ESCOLAS", 5),
  giganteEscolas: n("GIGANTE_ESCOLAS", 50),
  series: n("SERIES", 12),
  itensPorLista: n("ITENS_POR_LISTA", 30),
};

const ADMIN = process.env.CARGA_ADMIN_URL ?? process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
const BANCO = "lista_pronta_carga";
const host = new URL(ADMIN.replace(/^postgres(ql)?:/, "http:")).hostname;
if (!["localhost", "127.0.0.1", "::1", ""].includes(host)) {
  throw new Error(`recusado: ${host} não é local. Este script apaga e recria o banco.`);
}

const admin = new pg.Client({ connectionString: ADMIN });
await admin.connect();
await admin.query(`drop database if exists ${BANCO} with (force)`);
await admin.query(`create database ${BANCO} owner lp_dono`);
await admin.end();

const url = new URL(ADMIN);
url.pathname = `/${BANCO}`;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
// O dono do banco é lp_dono; o gerador escreve como ele, sem RLS no caminho
// porque as tabelas não usam FORCE (o mesmo desenho de produção).
await db.query("set role lp_dono");
await migrar(db);
await semear(db);

const t0 = Date.now();
const passo = async (nome, sql, params = []) => {
  const t = Date.now();
  const r = await db.query(sql, params);
  console.log(`${nome.padEnd(34)} ${String(r.rowCount ?? "").padStart(9)} linhas  ${((Date.now() - t) / 1000).toFixed(1)} s`);
};

await db.query("set synchronous_commit = off");
await db.query("begin");

await passo("papelarias", `
  create temp table f on commit drop as
  select g as n, gen_random_uuid() as id, g = 1 as gigante from generate_series(1, $1::int) g`, [P.papelarias]);
await db.query(`
  insert into public.fornecedor (id, nome, slug, whatsapp, endereco_retirada, aceita_entrega, aceita_retirada,
                                 taxa_entrega_centavos, descontos)
  select id, case when gigante then 'Papelaria Gigante' else 'Papelaria Carga ' || n end,
         case when gigante then 'gigante' else 'carga-' || n end,
         '11900000000', 'Rua da Carga, ' || n, true, true, 1000,
         '{"lista_completa":{"ativo":true,"percentual":5},"pix":{"ativo":true,"percentual":3}}'::jsonb
    from f`);

await passo("produtos", `
  create temp table pr on commit drop as
  select f.id as fornecedor_id, gen_random_uuid() as id, k
    from f, generate_series(1, case when f.gigante then $1::int else $2::int end) k`, [P.giganteProdutos, P.produtos]);
await db.query("create index on pr (fornecedor_id)");
await db.query(`
  insert into public.produto (id, fornecedor_id, nome, categoria, ordem)
  select id, fornecedor_id,
         (array['Caderno brochura 96 folhas','Lápis grafite nº 2','Lápis de cor 24 cores','Borracha branca',
                'Cola bastão 10 g','Tesoura sem ponta','Apontador com depósito','Régua 30 cm','Estojo escolar',
                'Caneta esferográfica azul','Marca-texto amarelo','Pasta com elástico','Papel sulfite A4',
                'Tinta guache 6 cores','Pincel escolar nº 8','Massinha de modelar','Folha de EVA',
                'Caderno de desenho 48 folhas','Giz de cera 12 cores','Bloco de desenho A4'])[1 + k % 20]
           || ' · modelo ' || k,
         'Categoria ' || (k % 12), k
    from pr`);
await passo("opções de produto (3 faixas)", `
  insert into public.produto_opcao (fornecedor_id, produto_id, faixa, marca, preco_centavos, disponivel)
  select pr.fornecedor_id, pr.id, fx, 'Marca ' || (pr.k % 25),
         300 + (pr.k * 37 % 3000) + case fx when 'economica' then 0 when 'intermediaria' then 700 else 1900 end,
         pr.k % 40 <> 0
    from pr, unnest(array['economica','intermediaria','premium']::public.faixa[]) fx`);

await passo("escolas", `
  create temp table es on commit drop as
  select f.id as fornecedor_id, gen_random_uuid() as id, k
    from f, generate_series(1, case when f.gigante then $1::int else $2::int end) k`, [P.giganteEscolas, P.escolas]);
await db.query(`insert into public.escola (id, fornecedor_id, nome, slug, cidade)
                select id, fornecedor_id, 'Escola Carga ' || k, 'escola-' || k, 'Cidade' from es`);
await passo("séries", `
  create temp table se on commit drop as
  select es.fornecedor_id, es.id as escola_id, gen_random_uuid() as id, s, 'Escola Carga ' || es.k as escola_nome
    from es, generate_series(1, $1::int) s`, [P.series]);
await db.query(`insert into public.serie (id, fornecedor_id, escola_id, nome, slug, ordem)
                select id, fornecedor_id, escola_id, s || 'º ano', s || '-ano', s from se`);
await passo("listas (uma publicada por série)", `
  create temp table li on commit drop as
  select se.fornecedor_id, se.id as serie_id, gen_random_uuid() as id, se.escola_nome, se.s || 'º ano' as serie_nome
    from se`);
// Tabela temporária não ganha estatística sozinha, e sem ela o planejador
// escolhe laço aninhado onde cabia hash: o passo dos pedidos ficava quadrático.
await db.query("create index on li (id); create index on li (fornecedor_id); analyze f; analyze pr; analyze li");
await db.query(`insert into public.lista (id, fornecedor_id, serie_id, ano_letivo, status, publicada_em, observacoes)
                select id, fornecedor_id, serie_id, 2027, 'publicada', now(),
                       'Todo material deve vir identificado com o nome do aluno.' from li`);
await passo("itens das listas", `
  insert into public.lista_item (fornecedor_id, lista_id, produto_id, quantidade, ordem)
  select l.fornecedor_id, l.id, p.id, 1 + abs(hashtext(l.id::text || p.id::text)) % 3, p.ordem
    from li l
    cross join lateral (
      select pr.id, (row_number() over ())::int as ordem
        from (select pr.id from pr where pr.fornecedor_id = l.fornecedor_id
               order by md5(l.id::text || pr.id::text) limit $1::int) pr) p`, [P.itensPorLista]);

// Total de cada lista em cada faixa, para o pedido nascer com o total certo
// sem precisar de UPDATE (o gatilho congela o pedido).
await passo("totais por lista e faixa", `
  create temp table lt on commit drop as
  select i.lista_id, o.faixa, sum(o.preco_centavos * i.quantidade)::int as subtotal, count(*) as itens
    from public.lista_item i join li on li.id = i.lista_id
    join public.produto_opcao o on o.produto_id = i.produto_id
   group by 1, 2`);
await db.query("create index on lt (lista_id, faixa); analyze lt");

await passo("pedidos", `
  create temp table pe on commit drop as
  with fl as (select fornecedor_id, array_agg(id order by id) as ids from li group by 1),
  base as (
    select f.id as fornecedor_id, gen_random_uuid() as id, k,
           fl.ids[1 + (k::bigint * 7919) % cardinality(fl.ids)] as lista_id,
           (array['economica','intermediaria','intermediaria','premium']::public.faixa[])[1 + k % 4] as faixa,
           (array['entregue','entregue','entregue','entregue','entregue','entregue','pago','em_separacao',
                  'pronto_para_retirada','saiu_para_entrega','expirado','cancelado','aguardando_pagamento',
                  'entregue','entregue','pago','em_separacao','entregue','entregue','entregue']::public.status_pedido[])[1 + k % 20] as status,
           now() - make_interval(mins => ((k::bigint * 104729) % (120 * 24 * 60))::int) as criado_em
      from f join fl on fl.fornecedor_id = f.id,
           generate_series(1, case when f.gigante then $1::int else $2::int end) k)
  select b.*, li.escola_nome, li.serie_nome, lt.subtotal
    from base b join li on li.id = b.lista_id
    join lt on lt.lista_id = b.lista_id and lt.faixa = b.faixa`, [P.gigantePedidos, P.pedidos]);
await db.query("create index on pe (id); analyze pe");
await db.query(`
  insert into public.pedido (id, fornecedor_id, lista_id, numero, token, status, faixa_base, escola_nome, serie_nome,
                             ano_letivo, aluno_nome, responsavel_nome, responsavel_whatsapp, modalidade, endereco,
                             metodo_pagamento, parcelas, subtotal_centavos, taxa_entrega_centavos, total_centavos,
                             criado_em, expira_em, pago_em, atualizado_em)
  select id, fornecedor_id, lista_id, 1000 + k,
         replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
         status, faixa, escola_nome, serie_nome, 2027,
         'Aluno ' || k || ' Albuquerque Santos', 'Responsável ' || k, '119' || lpad((k % 100000000)::text, 8, '0'),
         case when k % 3 = 0 then 'entrega'::public.modalidade_entrega else 'retirada' end,
         case when k % 3 = 0 then jsonb_build_object('cep', '01001000', 'logradouro', 'Rua da Carga', 'numero', k::text,
                                                     'bairro', 'Centro', 'cidade', 'São Paulo') end,
         case when k % 2 = 0 then 'pix'::public.metodo_pagamento else 'cartao' end, case when k % 2 = 0 then 1 else 1 + k % 3 end,
         subtotal, case when k % 3 = 0 then 1000 else 0 end, subtotal + case when k % 3 = 0 then 1000 else 0 end,
         criado_em, criado_em + interval '30 minutes',
         case when status not in ('aguardando_pagamento', 'expirado') then criado_em + interval '5 minutes' end,
         criado_em + interval '1 day'
    from pe`);
await db.query(`update public.fornecedor f set proximo_numero_pedido = x.m + 1
                  from (select fornecedor_id, max(1000 + k) as m from pe group by 1) x where x.fornecedor_id = f.id`);

await passo("itens dos pedidos", `
  insert into public.pedido_item (fornecedor_id, pedido_id, produto_id, opcao_id, nome_produto, marca, faixa, faixa_pedida,
                                  preco_unitario_centavos, quantidade, quantidade_lista, origem, ordem, separado, separado_em)
  select pe.fornecedor_id, pe.id, i.produto_id, o.id, p.nome, o.marca, o.faixa, o.faixa, o.preco_centavos,
         i.quantidade, i.quantidade, 'lista', i.ordem,
         pe.status in ('entregue', 'saiu_para_entrega', 'pronto_para_retirada'),
         case when pe.status in ('entregue', 'saiu_para_entrega', 'pronto_para_retirada') then pe.criado_em + interval '1 day' end
    from pe
    join public.lista_item i on i.lista_id = pe.lista_id
    join public.produto p on p.id = i.produto_id
    join public.produto_opcao o on o.produto_id = i.produto_id and o.faixa = pe.faixa`);
await passo("eventos dos pedidos", `
  insert into public.pedido_evento (fornecedor_id, pedido_id, status_de, status_para, criado_em)
  select pe.fornecedor_id, pe.id, t.de, t.para, pe.criado_em + t.depois
    from pe, lateral (values
      (null::public.status_pedido, 'aguardando_pagamento'::public.status_pedido, interval '0', true),
      ('aguardando_pagamento', 'pago', interval '5 minutes', pe.status not in ('aguardando_pagamento', 'expirado', 'cancelado')),
      ('pago', 'em_separacao', interval '1 hour', pe.status in ('em_separacao', 'pronto_para_retirada', 'saiu_para_entrega', 'entregue')),
      ('em_separacao', 'pronto_para_retirada', interval '1 day', pe.status in ('pronto_para_retirada', 'saiu_para_entrega', 'entregue')),
      ('pronto_para_retirada', 'entregue', interval '2 days', pe.status = 'entregue')) t(de, para, depois, vale)
   where t.vale`);
await passo("pagamentos", `
  insert into public.pagamento (fornecedor_id, pedido_id, provedor, metodo, status, valor_centavos, parcelas, id_externo, dados, criado_em)
  select fornecedor_id, id, 'fake', case when k % 2 = 0 then 'pix'::public.metodo_pagamento else 'cartao' end,
         case when status = 'aguardando_pagamento' then 'pendente'::public.status_pagamento
              when status = 'expirado' then 'expirado' else 'aprovado' end,
         subtotal, 1, 'carga-' || id, '{}'::jsonb, criado_em
    from pe`);

await db.query("commit");
await db.query("vacuum analyze");
console.log(`\ngerado em ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);

const { rows } = await db.query(`
  select c.relname as tabela, c.reltuples::bigint as linhas,
         pg_total_relation_size(c.oid) as bytes
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by bytes desc`);
const mb = (b) => (Number(b) / 1048576).toFixed(1).padStart(8) + " MB";
for (const r of rows) console.log(`${r.tabela.padEnd(16)} ${String(r.linhas).padStart(10)} linhas ${mb(r.bytes)}`);
const total = (await db.query("select pg_database_size(current_database()) as b")).rows[0].b;
const pedidos = Number((await db.query("select count(*) from public.pedido")).rows[0].count);
const dosPedidos = rows.filter((r) => ["pedido", "pedido_item", "pedido_evento", "pagamento"].includes(r.tabela))
  .reduce((s, r) => s + Number(r.bytes), 0);
console.log(`\nbanco inteiro ${mb(total)} · ${pedidos} pedidos · ${(dosPedidos / pedidos / 1024).toFixed(1)} KB por pedido (com itens, eventos e pagamento)`);
await db.end();
