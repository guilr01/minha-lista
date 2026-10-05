-- Lista Pronta: a superfície do pai, que não tem conta.
--
-- O papel anon não toca tabela: chama estas funções, que rodam como dono
-- (security definer), validam a entrada e devolvem só o que é público.
-- Toda função aqui revoga o execute padrão e concede um a um, no fim.

-- --------------------------------------------------------- regra da faixa
-- O pai escolhe uma faixa; o item pode não tê-la, ou tê-la indisponível.
-- Vale a mais próxima ABAIXO (não cobra mais do que o pai escolheu); sem
-- nenhuma abaixo, a mais próxima acima. Sem opção disponível, nada.
--
-- Esta regra existe também em src/lib/faixa.ts, para o total na tela
-- recalcular na hora. test/faixa-paridade.test.ts compara as duas.
create function app.opcao_resolvida(p_produto uuid, p_faixa public.faixa)
returns public.produto_opcao
language sql stable set search_path = '' as $$
  select o.*
  from public.produto_opcao o
  where o.produto_id = p_produto and o.disponivel
  order by
    case when o.faixa <= p_faixa then 0 else 1 end,
    abs(array_position(enum_range(null::public.faixa), o.faixa)
        - array_position(enum_range(null::public.faixa), p_faixa))
  limit 1
$$;

-- Opções disponíveis de um produto, no formato que a tela consome.
create function app.opcoes_json(p_produto uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'faixa', o.faixa, 'marca', o.marca,
           'descricao', o.descricao, 'preco_centavos', o.preco_centavos)
         order by o.faixa), '[]'::jsonb)
  from public.produto_opcao o
  where o.produto_id = p_produto and o.disponivel
$$;

create function app.papelaria_json(f public.fornecedor) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'nome', f.nome, 'slug', f.slug, 'whatsapp', f.whatsapp,
    'logo_path', f.logo_path, 'endereco_retirada', f.endereco_retirada,
    'aceita_entrega', f.aceita_entrega, 'aceita_retirada', f.aceita_retirada,
    'taxa_entrega_centavos', f.taxa_entrega_centavos)
$$;

-- ---------------------------------------------------------------- vitrine

-- A papelaria e as escolas/séries que têm lista publicada. Série sem lista
-- publicada não aparece: o pai não tem o que fazer nela.
create function public.vitrine_papelaria(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'papelaria', app.papelaria_json(f),
    'escolas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', e.nome, 'slug', e.slug, 'cidade', e.cidade,
               'series', (
                 select jsonb_agg(jsonb_build_object('nome', s.nome, 'slug', s.slug)
                                  order by s.ordem, s.nome)
                 from public.serie s
                 where s.escola_id = e.id
                   and exists (select 1 from public.lista l
                               where l.serie_id = s.id and l.status = 'publicada')))
             order by e.nome)
      from public.escola e
      where e.fornecedor_id = f.id
        and exists (select 1 from public.serie s
                    join public.lista l on l.serie_id = s.id and l.status = 'publicada'
                    where s.escola_id = e.id)), '[]'::jsonb))
  from public.fornecedor f
  where f.slug = p_slug
$$;

-- A lista publicada de uma série, com as opções de cada item.
create function public.vitrine_lista(p_slug text, p_escola text, p_serie text)
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
               'opcoes', app.opcoes_json(p.id))
             order by li.ordem, p.nome)
      from public.lista_item li
      join public.produto p on p.id = li.produto_id
      where li.lista_id = l.id and p.ativo), '[]'::jsonb))
  from public.fornecedor f
  join public.escola e on e.fornecedor_id = f.id and e.slug = p_escola
  join public.serie s on s.escola_id = e.id and s.slug = p_serie
  join public.lista l on l.serie_id = s.id and l.status = 'publicada'
  where f.slug = p_slug
$$;

-- O catálogo ativo, para "adicionar um item que faltou".
create function public.vitrine_catalogo(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'produto_id', p.id, 'nome', p.nome, 'categoria', p.categoria,
           'unidade', p.unidade, 'opcoes', app.opcoes_json(p.id))
         order by p.categoria nulls last, p.ordem, p.nome), '[]'::jsonb)
  from public.fornecedor f
  join public.produto p on p.fornecedor_id = f.id and p.ativo
  where f.slug = p_slug
    and exists (select 1 from public.produto_opcao o
                where o.produto_id = p.id and o.disponivel)
$$;

-- ----------------------------------------------------------- criar_pedido
-- Entrada:
-- { lista_id, faixa_base, metodo_pagamento, modalidade,
--   aluno_nome, responsavel_nome, responsavel_whatsapp,
--   endereco: { cep, logradouro, numero, complemento, bairro, cidade },
--   itens: [ { produto_id, faixa, quantidade } ] }
--
-- O que vem do navegador é a ESCOLHA, nunca o preço: preço, marca e nome
-- saem do catálogo agora e ficam gravados no pedido.
--
-- Erros levantam com errcode 'P0001' e a mensagem começando por um código
-- estável (ex.: 'lista_indisponivel: ...'), que a aplicação traduz.
create function public.criar_pedido(p jsonb) returns jsonb
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

  -- A papelaria está travada (for update acima): dois pedidos simultâneos
  -- não saem com o mesmo número.
  v_numero := v_forn.proximo_numero_pedido;
  update public.fornecedor set proximo_numero_pedido = v_numero + 1
  where id = v_forn.id;

  insert into public.pedido (
    id, fornecedor_id, lista_id, numero, token, status, faixa_base,
    escola_nome, serie_nome, ano_letivo, aluno_nome, responsavel_nome,
    responsavel_whatsapp, modalidade, endereco, metodo_pagamento,
    subtotal_centavos, taxa_entrega_centavos, total_centavos, expira_em)
  values (
    v_pedido, v_forn.id, v_lista.id, v_numero, v_token, 'aguardando_pagamento',
    v_faixa_base, v_escola, v_serie, v_lista.ano_letivo, v_aluno, v_resp,
    v_fone, v_modalidade, v_endereco, v_metodo,
    v_subtotal, v_taxa, v_subtotal + v_taxa, now() + interval '30 minutes');

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
    'subtotal_centavos', v_subtotal, 'taxa_entrega_centavos', v_taxa,
    'total_centavos', v_subtotal + v_taxa);
end $$;

-- ------------------------------------------------------- pedido_por_token
-- O acompanhamento do pai. Token inexistente devolve nulo, sem dizer mais.
create function public.pedido_por_token(p_token text) returns jsonb
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
    'metodo_pagamento', pe.metodo_pagamento,
    'subtotal_centavos', pe.subtotal_centavos,
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

-- --------------------------------------------------------------- concessões
revoke all on function app.opcao_resolvida(uuid, public.faixa) from public, anon, authenticated;
revoke all on function app.opcoes_json(uuid) from public, anon, authenticated;
revoke all on function app.papelaria_json(public.fornecedor) from public, anon, authenticated;

revoke all on function public.vitrine_papelaria(text) from public;
revoke all on function public.vitrine_lista(text, text, text) from public;
revoke all on function public.vitrine_catalogo(text) from public;
revoke all on function public.criar_pedido(jsonb) from public;
revoke all on function public.pedido_por_token(text) from public;

grant execute on function public.vitrine_papelaria(text) to anon, authenticated;
grant execute on function public.vitrine_lista(text, text, text) to anon, authenticated;
grant execute on function public.vitrine_catalogo(text) to anon, authenticated;
grant execute on function public.criar_pedido(jsonb) to anon, authenticated;
grant execute on function public.pedido_por_token(text) to anon, authenticated;
