-- Lista Pronta: isolamento entre papelarias.
--
-- Quem filtra é o Postgres, não a tela. Duas regras:
--   * o fornecedor (authenticated) enxerga e altera só as linhas da papelaria
--     de que é membro;
--   * o pai (anon) não lê nem escreve tabela nenhuma. Tudo que ele faz passa
--     pelas funções de 0003, que validam e devolvem só o que é público.
--
-- O schema `app` não é exposto pela API do Supabase: é onde mora a função
-- sobre a qual todas as políticas se apoiam.

create function app.eh_membro(p_fornecedor uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membro_fornecedor m
    where m.fornecedor_id = p_fornecedor
      and m.user_id = (select auth.uid())
  )
$$;

grant usage on schema app to authenticated;
revoke all on function app.eh_membro(uuid) from public, anon;
grant execute on function app.eh_membro(uuid) to authenticated;
revoke all on function app.tg_evento_somente_insercao() from public, anon, authenticated;
revoke all on function app.tg_pedido_item_congelado() from public, anon, authenticated;
revoke all on function app.tg_pedido_congelado() from public, anon, authenticated;

-- O Supabase concede tudo em public a anon e authenticated por padrão.
-- Aqui as concessões são explícitas: tirar tudo e devolver o necessário.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'fornecedor', 'membro_fornecedor', 'produto', 'produto_opcao', 'escola',
    'serie', 'lista', 'lista_item', 'pedido', 'pedido_item', 'pagamento',
    'pedido_evento'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ------------------------------------------------------------- fornecedor
-- Criar papelaria (e virar membro dela) é função, não insert direto: sem
-- isso alguém criaria a linha sem membro, ou se poria de membro da alheia.
grant select, update on public.fornecedor to authenticated;
-- proximo_numero_pedido é do banco: não se edita pela tela.
revoke update on public.fornecedor from authenticated;
grant update (nome, whatsapp, endereco_retirada, aceita_entrega, aceita_retirada,
              taxa_entrega_centavos, logo_path)
  on public.fornecedor to authenticated;

create policy fornecedor_leitura on public.fornecedor
  for select to authenticated using ((select app.eh_membro(id)));
create policy fornecedor_edicao on public.fornecedor
  for update to authenticated
  using ((select app.eh_membro(id))) with check ((select app.eh_membro(id)));

-- -------------------------------------------------------- membro_fornecedor
grant select on public.membro_fornecedor to authenticated;
create policy membro_leitura on public.membro_fornecedor
  for select to authenticated
  using (user_id = (select auth.uid()) or (select app.eh_membro(fornecedor_id)));

-- ------------------------------------- cadastro: CRUD completo do fornecedor
do $$
declare t text;
begin
  foreach t in array array[
    'produto', 'produto_opcao', 'escola', 'serie', 'lista', 'lista_item'
  ] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using ((select app.eh_membro(fornecedor_id)))
         with check ((select app.eh_membro(fornecedor_id)))',
      t || '_do_fornecedor', t);
  end loop;
end $$;

-- ----------------------------------------------------- pedidos: leitura só
-- Pedido nasce por criar_pedido e muda de status por função própria; o
-- fornecedor não escreve nele direto. Do item, só o checklist.
grant select on public.pedido, public.pedido_item, public.pagamento,
                public.pedido_evento to authenticated;
grant update (separado, separado_em) on public.pedido_item to authenticated;

create policy pedido_leitura on public.pedido
  for select to authenticated using ((select app.eh_membro(fornecedor_id)));
create policy pedido_item_leitura on public.pedido_item
  for select to authenticated using ((select app.eh_membro(fornecedor_id)));
create policy pedido_item_separacao on public.pedido_item
  for update to authenticated
  using ((select app.eh_membro(fornecedor_id)))
  with check ((select app.eh_membro(fornecedor_id)));
create policy pagamento_leitura on public.pagamento
  for select to authenticated using ((select app.eh_membro(fornecedor_id)));
create policy evento_leitura on public.pedido_evento
  for select to authenticated using ((select app.eh_membro(fornecedor_id)));
