-- Lista Pronta: descontos que a própria papelaria define (19/10/2026).
--
-- Quatro regras, cada uma ligada ou não e com o seu percentual:
--   lista_completa  o pai leva todos os itens da lista que estão à venda,
--                   cada um na quantidade que a escola pede ou mais
--   pix             o pai paga no Pix
--   valor_minimo    os produtos somam a partir de minimo_centavos
--   faixa           todos os itens foram escolhidos na faixa da regra
--
-- Os percentuais das regras cumpridas SE SOMAM, com teto de 50%, e incidem
-- só sobre os produtos: a taxa de entrega fica fora. O valor é truncado no
-- centavo, subtotal * percentual / 100: assim o desconto nunca passa do teto.
--
-- A MESMA regra existe em src/lib/desconto.ts, para a tela mostrar o total
-- certo; test/db/carrinho-paridade.test.ts confronta as duas.

-- ------------------------------------------------------- regras da papelaria
create function app.descontos_validos(d jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  k text;
  v jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' then return false; end if;
  for k, v in select * from jsonb_each(d) loop
    if k not in ('lista_completa', 'pix', 'valor_minimo', 'faixa') then return false; end if;
    if jsonb_typeof(v) is distinct from 'object'
       or jsonb_typeof(v -> 'ativo') is distinct from 'boolean'
       or jsonb_typeof(v -> 'percentual') is distinct from 'number'
       or (v ->> 'percentual')::numeric not in (select generate_series(1, 50)) then
      return false;
    end if;
    if k = 'valor_minimo' and (jsonb_typeof(v -> 'minimo_centavos') is distinct from 'number'
       or (v ->> 'minimo_centavos')::numeric <= 0
       or (v ->> 'minimo_centavos')::numeric <> trunc((v ->> 'minimo_centavos')::numeric)) then
      return false;
    end if;
    if k = 'faixa' and coalesce(v ->> 'faixa', '') not in ('economica', 'intermediaria', 'premium') then
      return false;
    end if;
  end loop;
  return true;
end $$;

alter table public.fornecedor
  add column descontos jsonb not null default '{}'::jsonb
  check (app.descontos_validos(descontos));

grant update (descontos) on public.fornecedor to authenticated;

-- ------------------------------------------------------------ no pedido
alter table public.pedido
  add column desconto_centavos integer not null default 0 check (desconto_centavos >= 0),
  -- As regras que valeram, congeladas: [{"regra": "pix", "percentual": 3}]
  add column descontos jsonb not null default '[]'::jsonb check (jsonb_typeof(descontos) = 'array');

-- O total passa a descontar. A restrição antiga não tem nome próprio: acha
-- pela definição, para valer igual aqui e no Neon.
do $$
declare v_nome text;
begin
  select conname into v_nome from pg_constraint
   where conrelid = 'public.pedido'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%total_centavos = (subtotal_centavos + taxa_entrega_centavos)%';
  if v_nome is null then raise exception 'restrição do total não encontrada'; end if;
  execute format('alter table public.pedido drop constraint %I', v_nome);
end $$;

alter table public.pedido
  add constraint pedido_total_com_desconto
    check (total_centavos = subtotal_centavos - desconto_centavos + taxa_entrega_centavos),
  add constraint pedido_desconto_teto check (desconto_centavos * 2 <= subtotal_centavos);

-- O desconto é congelado com o resto do pedido.
create or replace function app.tg_pedido_congelado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.fornecedor_id, new.lista_id, new.numero, new.token,
      new.faixa_base, new.escola_nome, new.serie_nome, new.ano_letivo,
      new.aluno_nome, new.responsavel_nome, new.responsavel_whatsapp,
      new.modalidade, new.endereco, new.metodo_pagamento, new.parcelas,
      new.subtotal_centavos, new.desconto_centavos, new.descontos,
      new.taxa_entrega_centavos, new.total_centavos, new.criado_em)
     is distinct from
     (old.id, old.fornecedor_id, old.lista_id, old.numero, old.token,
      old.faixa_base, old.escola_nome, old.serie_nome, old.ano_letivo,
      old.aluno_nome, old.responsavel_nome, old.responsavel_whatsapp,
      old.modalidade, old.endereco, old.metodo_pagamento, old.parcelas,
      old.subtotal_centavos, old.desconto_centavos, old.descontos,
      old.taxa_entrega_centavos, old.total_centavos, old.criado_em)
  then
    raise exception 'pedido é congelado na compra: só o status muda'
      using errcode = 'check_violation';
  end if;
  new.atualizado_em := now();
  return new;
end $$;

-- ----------------------------------------------------------------- a regra
-- p_linhas: as linhas que criar_pedido montou (produto_id, quantidade,
-- faixa_pedida). Devolve as regras cumpridas, na ordem fixa das quatro.
create function app.descontos_aplicados(
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
          where li.lista_id = p_lista
            and exists (select 1 from public.produto_opcao o where o.produto_id = pr.id and o.disponivel)
            and not exists (select 1 from jsonb_array_elements(p_linhas) l
                             where (l ->> 'produto_id')::uuid = li.produto_id
                               and (l ->> 'quantidade')::integer >= li.quantidade))
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
revoke all on function app.descontos_validos(jsonb) from public, anon;
-- A restrição roda como quem grava: a papelaria precisa poder executá-la.
grant execute on function app.descontos_validos(jsonb) to authenticated;

-- ------------------------------------------- funções que passam a descontar
create or replace function app.papelaria_json(f public.fornecedor) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'nome', f.nome, 'slug', f.slug, 'whatsapp', f.whatsapp,
    'logo_path', f.logo_path, 'endereco_retirada', f.endereco_retirada,
    'aceita_entrega', f.aceita_entrega, 'aceita_retirada', f.aceita_retirada,
    'taxa_entrega_centavos', f.taxa_entrega_centavos,
    'parcelas_maximas', f.parcelas_maximas,
    'descontos', f.descontos)
$$;

create or replace function public.criar_pedido(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_lista public.lista;
  v_forn public.fornecedor;
  v_escola text;
  v_serie text;
  v_modalidade public.modalidade_entrega;
  v_metodo public.metodo_pagamento;
  v_faixa_base public.faixa;
  v_aluno text := btrim(coalesce(p ->> 'aluno_nome', ''));
  v_resp text := btrim(coalesce(p ->> 'responsavel_nome', ''));
  v_fone text := regexp_replace(coalesce(p ->> 'responsavel_whatsapp', ''), '\D', '', 'g');
  v_endereco jsonb;
  v_item jsonb;
  v_prod public.produto;
  v_opcao public.produto_opcao;
  v_faixa public.faixa;
  v_qtd integer;
  v_qtd_lista integer;
  v_subtotal integer := 0;
  v_taxa integer := 0;
  v_numero integer;
  v_pedido uuid := gen_random_uuid();
  v_token text := replace(gen_random_uuid()::text, '-', '')
               || replace(gen_random_uuid()::text, '-', '');
  v_ordem integer := 0;
  v_vistos uuid[] := '{}';
  v_linhas jsonb := '[]'::jsonb;
  v_parcelas integer := 1;
  v_descontos jsonb;
  v_percentual integer;
  v_desconto integer;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'entrada_invalida: esperado um objeto';
  end if;

  select * into v_lista from public.lista
  where id = (p ->> 'lista_id')::uuid and status = 'publicada';
  if not found then
    raise exception 'lista_indisponivel: a lista não está publicada';
  end if;

  -- Trava a papelaria: o número do pedido sai de um contador nela.
  select * into v_forn from public.fornecedor
  where id = v_lista.fornecedor_id for update;

  select e.nome, s.nome into v_escola, v_serie
  from public.serie s join public.escola e on e.id = s.escola_id
  where s.id = v_lista.serie_id;

  begin
    v_modalidade := (p ->> 'modalidade')::public.modalidade_entrega;
    v_metodo := (p ->> 'metodo_pagamento')::public.metodo_pagamento;
    v_faixa_base := (p ->> 'faixa_base')::public.faixa;
  exception when invalid_text_representation then
    raise exception 'entrada_invalida: modalidade, método ou faixa desconhecidos';
  end;
  if v_modalidade is null or v_metodo is null or v_faixa_base is null then
    raise exception 'entrada_invalida: modalidade, método e faixa são obrigatórios';
  end if;

  if v_metodo = 'cartao' then
    v_parcelas := coalesce((p ->> 'parcelas')::integer, 1);
    if v_parcelas not between 1 and v_forn.parcelas_maximas then
      raise exception 'entrada_invalida: até % parcelas', v_forn.parcelas_maximas;
    end if;
  end if;

  if length(v_aluno) < 2 then raise exception 'dados_invalidos: nome do aluno'; end if;
  if length(v_resp) < 2 then raise exception 'dados_invalidos: nome do responsável'; end if;
  if length(v_fone) not between 10 and 11 then
    raise exception 'dados_invalidos: WhatsApp com DDD';
  end if;

  if v_modalidade = 'entrega' then
    if not v_forn.aceita_entrega then
      raise exception 'entrega_indisponivel: esta papelaria não entrega';
    end if;
    v_endereco := jsonb_build_object(
      'cep', regexp_replace(coalesce(p #>> '{endereco,cep}', ''), '\D', '', 'g'),
      'logradouro', btrim(coalesce(p #>> '{endereco,logradouro}', '')),
      'numero', btrim(coalesce(p #>> '{endereco,numero}', '')),
      'complemento', nullif(btrim(coalesce(p #>> '{endereco,complemento}', '')), ''),
      'bairro', nullif(btrim(coalesce(p #>> '{endereco,bairro}', '')), ''),
      'cidade', nullif(btrim(coalesce(p #>> '{endereco,cidade}', '')), ''));
    if length(v_endereco ->> 'cep') <> 8
       or length(v_endereco ->> 'logradouro') < 3
       or length(v_endereco ->> 'numero') < 1 then
      raise exception 'dados_invalidos: endereço de entrega incompleto';
    end if;
    v_taxa := v_forn.taxa_entrega_centavos;
  elsif not v_forn.aceita_retirada then
    raise exception 'retirada_indisponivel: esta papelaria não faz retirada';
  end if;

  if jsonb_typeof(p -> 'itens') is distinct from 'array'
     or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'pedido_vazio: nenhum item no pedido';
  end if;
  if jsonb_array_length(p -> 'itens') > 200 then
    raise exception 'entrada_invalida: itens demais';
  end if;

  -- Primeiro calcula todos os itens; o pedido só é gravado com o total
  -- certo. Gravar e corrigir depois exigiria desligar o gatilho que
  -- congela o pedido, e isso trava a tabela inteira.
  for v_item in select * from jsonb_array_elements(p -> 'itens') loop
    select * into v_prod from public.produto
    where id = (v_item ->> 'produto_id')::uuid
      and fornecedor_id = v_forn.id and ativo;
    if not found then
      raise exception 'item_indisponivel: produto % não está no catálogo',
        v_item ->> 'produto_id';
    end if;
    if v_prod.id = any (v_vistos) then
      raise exception 'entrada_invalida: produto repetido no pedido';
    end if;
    v_vistos := v_vistos || v_prod.id;

    v_qtd := (v_item ->> 'quantidade')::integer;
    if v_qtd is null or v_qtd not between 1 and 99 then
      raise exception 'entrada_invalida: quantidade de % fora de 1 a 99', v_prod.nome;
    end if;

    begin
      v_faixa := coalesce((v_item ->> 'faixa')::public.faixa, v_faixa_base);
    exception when invalid_text_representation then
      raise exception 'entrada_invalida: faixa desconhecida';
    end;

    v_opcao := app.opcao_resolvida(v_prod.id, v_faixa);
    if v_opcao.id is null then
      raise exception 'item_indisponivel: % está sem estoque', v_prod.nome;
    end if;

    v_qtd_lista := null;
    select li.quantidade into v_qtd_lista from public.lista_item li
    where li.lista_id = v_lista.id and li.produto_id = v_prod.id;

    v_linhas := v_linhas || jsonb_build_object(
      'produto_id', v_prod.id, 'opcao_id', v_opcao.id,
      'nome_produto', v_prod.nome, 'marca', v_opcao.marca,
      'faixa', v_opcao.faixa, 'faixa_pedida', v_faixa,
      'preco_unitario_centavos', v_opcao.preco_centavos,
      'quantidade', v_qtd, 'quantidade_lista', coalesce(v_qtd_lista, 0),
      'origem', case when v_qtd_lista is null then 'adicionado' else 'lista' end,
      'ordem', v_ordem);
    v_ordem := v_ordem + 1;
    v_subtotal := v_subtotal + v_opcao.preco_centavos * v_qtd;
  end loop;

  -- Os descontos da papelaria, sobre os produtos (a entrega não entra).
  v_descontos := app.descontos_aplicados(v_forn.descontos, v_lista.id, v_linhas, v_metodo, v_subtotal);
  select least(coalesce(sum((d ->> 'percentual')::integer), 0), 50)::integer into v_percentual
    from jsonb_array_elements(v_descontos) d;
  v_desconto := v_subtotal * v_percentual / 100;

  -- A tela calculou um total com os preços e as regras de quando a página
  -- abriu. Se algo mudou desde então, o pai vê o valor novo ANTES de pagar.
  if p ? 'total_esperado_centavos'
     and (p ->> 'total_esperado_centavos')::integer is distinct from v_subtotal - v_desconto + v_taxa then
    raise exception 'preco_mudou: o total agora é % centavos', v_subtotal - v_desconto + v_taxa;
  end if;

  -- A papelaria está travada (for update acima): dois pedidos simultâneos
  -- não saem com o mesmo número.
  v_numero := v_forn.proximo_numero_pedido;
  update public.fornecedor set proximo_numero_pedido = v_numero + 1
  where id = v_forn.id;

  insert into public.pedido (
    id, fornecedor_id, lista_id, numero, token, status, faixa_base,
    escola_nome, serie_nome, ano_letivo, aluno_nome, responsavel_nome,
    responsavel_whatsapp, modalidade, endereco, metodo_pagamento, parcelas,
    subtotal_centavos, desconto_centavos, descontos, taxa_entrega_centavos, total_centavos, expira_em)
  values (
    v_pedido, v_forn.id, v_lista.id, v_numero, v_token, 'aguardando_pagamento',
    v_faixa_base, v_escola, v_serie, v_lista.ano_letivo, v_aluno, v_resp,
    v_fone, v_modalidade, v_endereco, v_metodo, v_parcelas,
    v_subtotal, v_desconto, v_descontos, v_taxa, v_subtotal - v_desconto + v_taxa,
    now() + interval '30 minutes');

  insert into public.pedido_item (
    fornecedor_id, pedido_id, produto_id, opcao_id, nome_produto, marca,
    faixa, faixa_pedida, preco_unitario_centavos, quantidade,
    quantidade_lista, origem, ordem)
  select v_forn.id, v_pedido, r.produto_id, r.opcao_id, r.nome_produto, r.marca,
         r.faixa, r.faixa_pedida, r.preco_unitario_centavos, r.quantidade,
         r.quantidade_lista, r.origem, r.ordem
  from jsonb_to_recordset(v_linhas) as r(
    produto_id uuid, opcao_id uuid, nome_produto text, marca text,
    faixa public.faixa, faixa_pedida public.faixa, preco_unitario_centavos integer,
    quantidade integer, quantidade_lista integer, origem public.origem_item,
    ordem integer);

  insert into public.pedido_evento (fornecedor_id, pedido_id, status_de, status_para)
  values (v_forn.id, v_pedido, null, 'aguardando_pagamento');

  return jsonb_build_object(
    'token', v_token, 'numero', v_numero,
    'subtotal_centavos', v_subtotal, 'desconto_centavos', v_desconto,
    'descontos', v_descontos, 'taxa_entrega_centavos', v_taxa,
    'total_centavos', v_subtotal - v_desconto + v_taxa);
end $$;

create or replace function public.pedido_por_token(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'numero', pe.numero,
    'status', case when pe.status = 'aguardando_pagamento' and pe.expira_em < now()
                   then 'expirado'::public.status_pedido else pe.status end,
    'papelaria', app.papelaria_json(f),
    'escola_nome', pe.escola_nome, 'serie_nome', pe.serie_nome,
    'ano_letivo', pe.ano_letivo, 'faixa_base', pe.faixa_base,
    'aluno_nome', pe.aluno_nome, 'responsavel_nome', pe.responsavel_nome,
    'modalidade', pe.modalidade, 'endereco', pe.endereco,
    'metodo_pagamento', pe.metodo_pagamento, 'parcelas', pe.parcelas,
    'subtotal_centavos', pe.subtotal_centavos,
    'desconto_centavos', pe.desconto_centavos, 'descontos', pe.descontos,
    'taxa_entrega_centavos', pe.taxa_entrega_centavos,
    'total_centavos', pe.total_centavos,
    'criado_em', pe.criado_em, 'expira_em', pe.expira_em, 'pago_em', pe.pago_em,
    'itens', (select jsonb_agg(jsonb_build_object(
                       'nome', i.nome_produto, 'marca', i.marca, 'faixa', i.faixa,
                       'faixa_pedida', i.faixa_pedida,
                       'preco_unitario_centavos', i.preco_unitario_centavos,
                       'quantidade', i.quantidade, 'origem', i.origem)
                     order by i.ordem)
              from public.pedido_item i where i.pedido_id = pe.id),
    'eventos', (select jsonb_agg(jsonb_build_object(
                         'status', ev.status_para, 'em', ev.criado_em)
                       order by ev.criado_em, ev.id)
                from public.pedido_evento ev where ev.pedido_id = pe.id),
    'pagamento', (select jsonb_build_object(
                           'metodo', pg.metodo, 'status', pg.status,
                           'parcelas', pg.parcelas, 'dados', pg.dados)
                  from public.pagamento pg where pg.pedido_id = pe.id
                  order by pg.criado_em desc limit 1))
  from public.pedido pe
  join public.fornecedor f on f.id = pe.fornecedor_id
  where pe.token = p_token
$$;
