-- Lista Pronta: publicar e encerrar listas.
--
-- O cadastro (produto, opção, escola, série, lista, item) é escrita direta da
-- papelaria, e o RLS de 0002 já decide de quem é cada linha. O que precisa de
-- REGRA são as mudanças de status da lista, e elas moram aqui, numa definição
-- só:
--
--   * só publica lista com pelo menos um item;
--   * publicar encerra a que estava publicada na mesma série (a de 2026 sai
--     do ar quando a de 2027 entra), na mesma transação, para a série nunca
--     ficar com duas nem com nenhuma por um instante;
--   * encerrar tira do ar sem apagar: pedidos antigos apontam para ela.
--
-- As duas são `security invoker`: rodam como quem chamou, então o RLS vale
-- dentro delas. Lista de outra papelaria é invisível e responde como
-- inexistente.

create function public.publicar_lista(p_lista uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_lista public.lista;
  v_itens integer;
  v_encerrada uuid;
begin
  select * into v_lista from public.lista where id = p_lista for update;
  if not found then
    raise exception 'lista_inexistente';
  end if;
  if v_lista.status = 'publicada' then
    return jsonb_build_object('lista_id', v_lista.id, 'encerrou', null);
  end if;

  select count(*) into v_itens from public.lista_item where lista_id = v_lista.id;
  if v_itens = 0 then
    raise exception 'lista_vazia: inclua pelo menos um item antes de publicar';
  end if;

  update public.lista set status = 'encerrada', encerrada_em = now()
   where serie_id = v_lista.serie_id and status = 'publicada'
  returning id into v_encerrada;

  update public.lista set status = 'publicada', publicada_em = now(), encerrada_em = null
   where id = v_lista.id;

  return jsonb_build_object('lista_id', v_lista.id, 'encerrou', v_encerrada);
end $$;

create function public.encerrar_lista(p_lista uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.lista set status = 'encerrada', encerrada_em = now()
   where id = p_lista and status = 'publicada';
  if not found then
    if not exists (select 1 from public.lista where id = p_lista) then
      raise exception 'lista_inexistente';
    end if;
  end if;
end $$;

revoke all on function public.publicar_lista(uuid) from public, anon;
revoke all on function public.encerrar_lista(uuid) from public, anon;
grant execute on function public.publicar_lista(uuid) to authenticated;
grant execute on function public.encerrar_lista(uuid) to authenticated;
