-- Impressão digital dos dados do seed, sem datas e sem o id aleatório de
-- lista_item. Mesmo uso de impressao-schema.sql.
select 'fornecedor' t, md5(string_agg(concat_ws('|', id, nome, slug, whatsapp, endereco_retirada, aceita_entrega, aceita_retirada, taxa_entrega_centavos, parcelas_maximas, proximo_numero_pedido), ',' order by id)) h, count(*) n from public.fornecedor
union all select 'produto', md5(string_agg(concat_ws('|', id, fornecedor_id, nome, categoria, unidade, ativo, ordem), ',' order by id)), count(*) from public.produto
union all select 'produto_opcao', md5(string_agg(concat_ws('|', id, produto_id, faixa, marca, preco_centavos, disponivel), ',' order by id)), count(*) from public.produto_opcao
union all select 'escola', md5(string_agg(concat_ws('|', id, nome, slug, cidade), ',' order by id)), count(*) from public.escola
union all select 'serie', md5(string_agg(concat_ws('|', id, escola_id, nome, slug, ordem), ',' order by id)), count(*) from public.serie
union all select 'lista', md5(string_agg(concat_ws('|', id, serie_id, ano_letivo, status, observacoes, publicada_em is null, encerrada_em is null), ',' order by id)), count(*) from public.lista
union all select 'lista_item', md5(string_agg(concat_ws('|', lista_id, produto_id, quantidade, observacao, ordem), ',' order by lista_id, produto_id)), count(*) from public.lista_item
order by 1
