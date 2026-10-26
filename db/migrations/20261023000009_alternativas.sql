-- Item com alternativas: "lápis ou lapiseira", "pasta fichário ou catálogo".
--
-- A escola aceita mais de um produto para o mesmo item, e QUEM ESCOLHE É O
-- CLIENTE, na revisão (decisão do Guilherme, 23/10/2026). A alternativa é uma
-- linha de lista_item que aponta para o item principal da MESMA lista; o
-- principal é o que aparece de saída, e o cliente troca por uma alternativa
-- como troca a faixa.
--
-- Duas pontas passam a tratar o grupo como UM item:
--   vitrine_lista       entrega o principal com as alternativas dentro
--   descontos_aplicados qualquer produto do grupo completa a lista
-- e o espelho da regra em TypeScript (src/lib/desconto.ts, listaCompleta)
-- muda junto; test/db/carrinho-paridade.test.ts confronta os dois.

alter table public.lista_item add column alternativa_de uuid;

-- Mesma lista garantida pela chave: a alternativa não aponta para item de
-- outra lista (nem de outra papelaria).
alter table public.lista_item add constraint lista_item_lista_id_id_key unique (lista_id, id);
alter table public.lista_item add constraint lista_item_alternativa_fk
  foreign key (lista_id, alternativa_de) references public.lista_item (lista_id, id) on delete cascade;
alter table public.lista_item add constraint lista_item_alternativa_de_si check (alternativa_de is distinct from id);
create index lista_item_alternativa_de_idx on public.lista_item (alternativa_de) where alternativa_de is not null;

-- Um nível só: alternativa de alternativa, ou principal com alternativas
-- virando alternativa, não tem leitura possível na tela do cliente.
create function app.tg_lista_item_um_nivel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.alternativa_de is not null then
    if exists (select 1 from public.lista_item where id = new.alternativa_de and alternativa_de is not null) then
      raise exception 'alternativa_de_alternativa: a alternativa aponta para o item principal'
        using errcode = 'check_violation';
    end if;
    if exists (select 1 from public.lista_item where alternativa_de = new.id) then
      raise exception 'principal_com_alternativas: item com alternativas não vira alternativa'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function app.tg_lista_item_um_nivel() from public, anon, authenticated;

create trigger lista_item_um_nivel
  before insert or update of alternativa_de on public.lista_item
  for each row execute function app.tg_lista_item_um_nivel();

-- ------------------------------------------------------------ vitrine_lista
-- Só os principais são itens; cada um leva as suas alternativas (ativas).
create or replace function public.vitrine_lista(p_slug text, p_escola text, p_serie text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'papelaria', app.papelaria_json(f),
    'escola', jsonb_build_object('nome', e.nome, 'slug', e.slug),
    'serie', jsonb_build_object('nome', s.nome, 'slug', s.slug),
    'lista', jsonb_build_object('id', l.id, 'ano_letivo', l.ano_letivo,
                                'observacoes', l.observacoes),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produto_id', p.id, 'nome', p.nome, 'categoria', p.categoria,
               'unidade', p.unidade, 'quantidade', li.quantidade,
               'observacao', li.observacao,
               'opcoes', app.opcoes_json(p.id),
               'alternativas', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'produto_id', pa.id, 'nome', pa.nome, 'categoria', pa.categoria,
                          'unidade', pa.unidade, 'quantidade', la.quantidade,
                          'observacao', la.observacao, 'opcoes', app.opcoes_json(pa.id))
                        order by la.ordem, pa.nome)
                 from public.lista_item la
                 join public.produto pa on pa.id = la.produto_id
                 where la.alternativa_de = li.id and pa.ativo), '[]'::jsonb))
             order by li.ordem, p.nome)
      from public.lista_item li
      join public.produto p on p.id = li.produto_id
      where li.lista_id = l.id and li.alternativa_de is null and p.ativo), '[]'::jsonb))
  from public.fornecedor f
  join public.escola e on e.fornecedor_id = f.id and e.slug = p_escola
  join public.serie s on s.escola_id = e.id and s.slug = p_serie
  join public.lista l on l.serie_id = s.id and l.status = 'publicada'
  where f.slug = p_slug
$$;

-- ------------------------------------------------------ descontos_aplicados
-- Lista completa: cada item PRINCIPAL que tem algo à venda (ele ou uma
-- alternativa) precisa estar no pedido por um produto do grupo, na
-- quantidade da escola ou mais. O resto da regra não muda.
create or replace function app.descontos_aplicados(
  p_regras jsonb, p_lista uuid, p_linhas jsonb, p_metodo public.metodo_pagamento, p_subtotal integer
) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('regra', r.regra, 'percentual', r.percentual) order by r.ordem), '[]'::jsonb)
  from (
    select 1 as ordem, 'lista_completa' as regra, (p_regras #>> '{lista_completa,percentual}')::integer as percentual
     where (p_regras #>> '{lista_completa,ativo}')::boolean
       and not exists (
         select 1 from public.lista_item li
           join public.produto pr on pr.id = li.produto_id and pr.ativo
          where li.lista_id = p_lista and li.alternativa_de is null
            and exists (select 1 from public.lista_item g
                          join public.produto pg on pg.id = g.produto_id and pg.ativo
                          join public.produto_opcao o on o.produto_id = pg.id and o.disponivel
                         where g.id = li.id or g.alternativa_de = li.id)
            and not exists (select 1 from jsonb_array_elements(p_linhas) l
                              join public.lista_item g on g.produto_id = (l ->> 'produto_id')::uuid
                                                     and (g.id = li.id or g.alternativa_de = li.id)
                             where (l ->> 'quantidade')::integer >= li.quantidade))
    union all
    select 2, 'pix', (p_regras #>> '{pix,percentual}')::integer
     where (p_regras #>> '{pix,ativo}')::boolean and p_metodo = 'pix'
    union all
    select 3, 'valor_minimo', (p_regras #>> '{valor_minimo,percentual}')::integer
     where (p_regras #>> '{valor_minimo,ativo}')::boolean
       and p_subtotal >= (p_regras #>> '{valor_minimo,minimo_centavos}')::integer
    union all
    select 4, 'faixa', (p_regras #>> '{faixa,percentual}')::integer
     where (p_regras #>> '{faixa,ativo}')::boolean
       and jsonb_array_length(p_linhas) > 0
       and not exists (select 1 from jsonb_array_elements(p_linhas) l
                        where l ->> 'faixa_pedida' is distinct from p_regras #>> '{faixa,faixa}')
  ) r
$$;
revoke all on function app.descontos_aplicados(jsonb, uuid, jsonb, public.metodo_pagamento, integer) from public, anon, authenticated;
