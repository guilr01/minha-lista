-- Lista Pronta: o caminho do pagamento.
--
-- As duas funções aqui são do SISTEMA: nenhum papel de requisição as executa.
-- A aplicação as chama como o dono do banco (comoSistema, em src/lib/db.ts),
-- depois de falar com o provedor de pagamento:
--
--   pedido criado → provedor cria a cobrança → registrar_cobranca
--   provedor avisa (webhook) → confirmar_pagamento
--
-- A simulação do provedor falso passa pelo MESMO confirmar_pagamento: não
-- existe um segundo caminho para marcar um pedido como pago.

create function app.registrar_cobranca(
  p_token text, p_provedor text, p_metodo public.metodo_pagamento,
  p_id_externo text, p_parcelas integer, p_dados jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_pedido public.pedido;
begin
  select * into v_pedido from public.pedido where token = p_token;
  if not found then
    raise exception 'pedido_inexistente';
  end if;
  if v_pedido.status <> 'aguardando_pagamento' then
    raise exception 'pedido_nao_aguarda_pagamento: status %', v_pedido.status;
  end if;
  if p_metodo <> v_pedido.metodo_pagamento then
    raise exception 'metodo_divergente';
  end if;
  -- O valor cobrado é o do pedido, nunca um valor que venha de fora.
  insert into public.pagamento (fornecedor_id, pedido_id, provedor, metodo, status,
                                valor_centavos, parcelas, id_externo, dados)
  values (v_pedido.fornecedor_id, v_pedido.id, p_provedor, p_metodo, 'pendente',
          v_pedido.total_centavos, coalesce(p_parcelas, 1), p_id_externo,
          coalesce(p_dados, '{}'::jsonb));
end $$;

-- Idempotente: o mesmo aviso duas vezes não gera dois eventos. Devolve o que
-- mudou, para quem chamou decidir se avisa alguém (o ponto do WhatsApp).
create function app.confirmar_pagamento(
  p_provedor text, p_id_externo text, p_status public.status_pagamento
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pag public.pagamento;
  v_pedido public.pedido;
  v_mudou boolean := false;
begin
  select * into v_pag from public.pagamento
  where provedor = p_provedor and id_externo = p_id_externo
  for update;
  if not found then
    raise exception 'pagamento_inexistente';
  end if;

  select * into v_pedido from public.pedido where id = v_pag.pedido_id for update;

  if v_pag.status is distinct from p_status then
    update public.pagamento set status = p_status, atualizado_em = now()
    where id = v_pag.id;
  end if;

  -- Dinheiro recebido vale mesmo depois dos 30 minutos: o Pix "expirado" na
  -- tela é convite a pagar de novo, não recusa de quem já pagou.
  if p_status = 'aprovado' and v_pedido.status in ('aguardando_pagamento', 'expirado') then
    update public.pedido set status = 'pago', pago_em = now() where id = v_pedido.id;
    insert into public.pedido_evento (fornecedor_id, pedido_id, status_de, status_para)
    values (v_pedido.fornecedor_id, v_pedido.id, v_pedido.status, 'pago');
    v_mudou := true;
  end if;

  return jsonb_build_object(
    'pedido_id', v_pedido.id, 'fornecedor_id', v_pedido.fornecedor_id,
    'numero', v_pedido.numero, 'token', v_pedido.token,
    'status', case when v_mudou then 'pago' else v_pedido.status::text end,
    'mudou', v_mudou);
end $$;

revoke all on function app.registrar_cobranca(text, text, public.metodo_pagamento, text, integer, jsonb)
  from public, anon, authenticated;
revoke all on function app.confirmar_pagamento(text, text, public.status_pagamento)
  from public, anon, authenticated;
