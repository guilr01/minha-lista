-- Lista Pronta: acesso da papelaria e o painel de pedidos.
--
-- Login próprio (decisão de 05/10/2026): a senha é cifrada na aplicação
-- (scrypt, src/lib/autenticacao.ts) e só o resultado chega aqui. A sessão é
-- um token aleatório no cookie; o banco guarda o SHA-256 dele, nunca o token,
-- para um vazamento desta tabela não virar sessão de ninguém.
--
-- Nada aqui é lido pelos papéis da requisição: login e sessão são do sistema.

alter table app.usuario add column senha_hash text;

create table app.sessao (
  -- sha256 do token, em hexadecimal
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  usuario_id uuid not null references app.usuario (id) on delete cascade,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null
);
create index on app.sessao (usuario_id);

-- Tentativas de senha erradas, para o limite. Guarda o e-mail tentado e um
-- hash da origem, nunca a senha.
create table app.falha_login (
  id bigint generated always as identity primary key,
  email text not null,
  origem text,
  em timestamptz not null default now()
);
create index on app.falha_login (email, em);
create index on app.falha_login (origem, em);

-- ------------------------------------------------- o checklist e o status
-- O fornecedor deixa de escrever direto em pedido_item: marcar item e mudar
-- status passam por estas duas funções, que conferem a papelaria, o estado do
-- pedido e gravam quem fez na trilha.

drop policy pedido_item_separacao on public.pedido_item;
revoke update on public.pedido_item from authenticated;

create function public.marcar_item_separado(p_item uuid, p_separado boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.pedido_item;
  v_pedido public.pedido;
  v_mudou_status boolean := false;
begin
  select * into v_item from public.pedido_item where id = p_item;
  -- Item de outra papelaria responde igual a item inexistente.
  if not found or not app.eh_membro(v_item.fornecedor_id) then
    raise exception 'item_inexistente';
  end if;
  select * into v_pedido from public.pedido where id = v_item.pedido_id for update;
  if v_pedido.status not in ('pago', 'em_separacao') then
    raise exception 'separacao_encerrada: pedido %', v_pedido.status;
  end if;

  update public.pedido_item
     set separado = p_separado,
         separado_em = case when p_separado then now() else null end
   where id = p_item;

  -- Marcar o primeiro item é começar a separar (como no protótipo).
  if p_separado and v_pedido.status = 'pago' then
    update public.pedido set status = 'em_separacao' where id = v_pedido.id;
    insert into public.pedido_evento (fornecedor_id, pedido_id, status_de, status_para, autor_id)
    values (v_pedido.fornecedor_id, v_pedido.id, 'pago', 'em_separacao', app.usuario_atual());
    v_mudou_status := true;
  end if;

  return jsonb_build_object(
    'pedido_id', v_pedido.id, 'numero', v_pedido.numero,
    'status', case when v_mudou_status then 'em_separacao' else v_pedido.status::text end,
    'mudou_status', v_mudou_status);
end $$;

-- A única forma de o pedido andar depois de pago. Transições permitidas:
--   pago → em_separacao
--   em_separacao → saiu_para_entrega (entrega) | pronto_para_retirada (retirada),
--                  só com TODOS os itens separados
--   saiu_para_entrega | pronto_para_retirada → entregue
create function public.avancar_pedido(p_pedido uuid, p_para public.status_pedido)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedido;
  v_permitido boolean;
  v_faltam integer;
begin
  select * into v_pedido from public.pedido where id = p_pedido for update;
  if not found or not app.eh_membro(v_pedido.fornecedor_id) then
    raise exception 'pedido_inexistente';
  end if;

  v_permitido := case v_pedido.status
    when 'pago' then p_para = 'em_separacao'
    when 'em_separacao' then
      (v_pedido.modalidade = 'entrega' and p_para = 'saiu_para_entrega')
      or (v_pedido.modalidade = 'retirada' and p_para = 'pronto_para_retirada')
    when 'saiu_para_entrega' then p_para = 'entregue'
    when 'pronto_para_retirada' then p_para = 'entregue'
    else false
  end;
  if not v_permitido then
    raise exception 'transicao_invalida: de % para %', v_pedido.status, p_para;
  end if;

  if v_pedido.status = 'em_separacao' then
    select count(*) into v_faltam from public.pedido_item
    where pedido_id = v_pedido.id and not separado;
    if v_faltam > 0 then
      raise exception 'separacao_incompleta: faltam % itens', v_faltam;
    end if;
  end if;

  update public.pedido set status = p_para where id = v_pedido.id;
  insert into public.pedido_evento (fornecedor_id, pedido_id, status_de, status_para, autor_id)
  values (v_pedido.fornecedor_id, v_pedido.id, v_pedido.status, p_para, app.usuario_atual());

  return jsonb_build_object('pedido_id', v_pedido.id, 'numero', v_pedido.numero, 'status', p_para);
end $$;

revoke all on function public.marcar_item_separado(uuid, boolean) from public, anon;
revoke all on function public.avancar_pedido(uuid, public.status_pedido) from public, anon;
grant execute on function public.marcar_item_separado(uuid, boolean) to authenticated;
grant execute on function public.avancar_pedido(uuid, public.status_pedido) to authenticated;
