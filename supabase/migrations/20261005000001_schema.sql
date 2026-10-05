-- Lista Pronta: schema base.
--
-- Regras que este arquivo garante no banco, e não na aplicação:
--   * toda tabela de domínio carrega fornecedor_id (multi-tenant);
--   * filho referencia pai por (fornecedor_id, id): um item de lista não
--     consegue apontar para o produto de outra papelaria, nem por engano;
--   * dinheiro é inteiro em centavos;
--   * o pedido é uma cópia congelada: preço, nome e marca são gravados na
--     compra, e um gatilho recusa alterá-los depois.

create schema if not exists app;

create type public.faixa as enum ('economica', 'intermediaria', 'premium');
create type public.status_lista as enum ('rascunho', 'publicada', 'encerrada');
create type public.status_pedido as enum (
  'aguardando_pagamento', 'pago', 'em_separacao',
  'saiu_para_entrega', 'pronto_para_retirada', 'entregue',
  'cancelado', 'expirado'
);
create type public.modalidade_entrega as enum ('entrega', 'retirada');
create type public.metodo_pagamento as enum ('pix', 'cartao');
create type public.status_pagamento as enum ('pendente', 'aprovado', 'recusado', 'expirado', 'estornado');
create type public.origem_item as enum ('lista', 'adicionado');

-- ---------------------------------------------------------------- fornecedor

create table public.fornecedor (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 120),
  -- O slug vira a primeira parte da URL pública, então não pode colidir com
  -- as rotas da própria aplicação.
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60)
    check (slug not in ('painel', 'entrar', 'sair', 'cadastro', 'api', 'pedido',
                        'admin', 'login', 'conta', 'ajuda', 'termos', 'privacidade')),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,13}$'),
  endereco_retirada text,
  aceita_entrega boolean not null default true,
  aceita_retirada boolean not null default true,
  taxa_entrega_centavos integer not null default 0 check (taxa_entrega_centavos >= 0),
  logo_path text,
  -- Contador do número humano do pedido ("#1042"), por papelaria.
  proximo_numero_pedido integer not null default 1001,
  criado_em timestamptz not null default now(),
  check (aceita_entrega or aceita_retirada)
);

create table public.membro_fornecedor (
  fornecedor_id uuid not null references public.fornecedor (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null default 'dono' check (papel in ('dono')),
  criado_em timestamptz not null default now(),
  primary key (fornecedor_id, user_id)
);
create index on public.membro_fornecedor (user_id);

-- ----------------------------------------------------------------- catálogo

create table public.produto (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedor (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 160),
  categoria text,
  unidade text not null default 'un',
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (fornecedor_id, id)
);
create index on public.produto (fornecedor_id, ordem);

create table public.produto_opcao (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null,
  produto_id uuid not null,
  faixa public.faixa not null,
  marca text not null check (length(btrim(marca)) between 1 and 80),
  descricao text,
  preco_centavos integer not null check (preco_centavos > 0),
  disponivel boolean not null default true,
  imagem_path text,
  criado_em timestamptz not null default now(),
  unique (produto_id, faixa),
  unique (fornecedor_id, id),
  foreign key (fornecedor_id, produto_id)
    references public.produto (fornecedor_id, id) on delete cascade
);

-- ---------------------------------------------------- escolas, séries, listas

create table public.escola (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedor (id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  cidade text,
  criado_em timestamptz not null default now(),
  unique (fornecedor_id, slug),
  unique (fornecedor_id, id)
);

create table public.serie (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null,
  escola_id uuid not null,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  unique (escola_id, slug),
  unique (fornecedor_id, id),
  foreign key (fornecedor_id, escola_id)
    references public.escola (fornecedor_id, id) on delete cascade
);

-- A lista é da série E do ano letivo: montar a de 2027 não apaga a de 2026,
-- que é a que os pedidos antigos referenciam.
create table public.lista (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null,
  serie_id uuid not null,
  ano_letivo integer not null check (ano_letivo between 2020 and 2100),
  status public.status_lista not null default 'rascunho',
  observacoes text,
  publicada_em timestamptz,
  encerrada_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (serie_id, ano_letivo),
  unique (fornecedor_id, id),
  foreign key (fornecedor_id, serie_id)
    references public.serie (fornecedor_id, id) on delete restrict
);
-- No máximo uma lista publicada por série: o link da série tem uma resposta só.
create unique index lista_uma_publicada_por_serie
  on public.lista (serie_id) where status = 'publicada';

create table public.lista_item (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null,
  lista_id uuid not null,
  produto_id uuid not null,
  quantidade integer not null check (quantidade between 1 and 99),
  -- Exigência da escola que acompanha o item: "encapar de azul".
  observacao text,
  ordem integer not null default 0,
  unique (lista_id, produto_id),
  foreign key (fornecedor_id, lista_id)
    references public.lista (fornecedor_id, id) on delete cascade,
  foreign key (fornecedor_id, produto_id)
    references public.produto (fornecedor_id, id) on delete restrict
);

-- -------------------------------------------------------------------- pedido

create table public.pedido (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references public.fornecedor (id) on delete restrict,
  lista_id uuid references public.lista (id) on delete restrict,
  numero integer not null,
  -- O pai não tem conta: o token É o acesso ao acompanhamento.
  token text not null unique check (length(token) >= 48),
  status public.status_pedido not null default 'aguardando_pagamento',
  faixa_base public.faixa not null,
  -- Cópia do que o pai viu, para o pedido continuar legível se a escola,
  -- a série ou a lista mudarem de nome depois.
  escola_nome text not null,
  serie_nome text not null,
  ano_letivo integer not null,
  aluno_nome text not null check (length(btrim(aluno_nome)) between 2 and 120),
  responsavel_nome text not null check (length(btrim(responsavel_nome)) between 2 and 120),
  responsavel_whatsapp text not null check (responsavel_whatsapp ~ '^[0-9]{10,11}$'),
  modalidade public.modalidade_entrega not null,
  endereco jsonb,
  metodo_pagamento public.metodo_pagamento not null,
  subtotal_centavos integer not null check (subtotal_centavos > 0),
  taxa_entrega_centavos integer not null check (taxa_entrega_centavos >= 0),
  total_centavos integer not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz,
  pago_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (fornecedor_id, numero),
  unique (fornecedor_id, id),
  check (total_centavos = subtotal_centavos + taxa_entrega_centavos),
  check ((modalidade = 'entrega') = (endereco is not null))
);
create index on public.pedido (fornecedor_id, status, criado_em desc);

create table public.pedido_item (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null,
  pedido_id uuid not null,
  -- Referências só para relatório: o que vale é a cópia abaixo. Se o produto
  -- for apagado do catálogo, o pedido continua inteiro.
  produto_id uuid references public.produto (id) on delete set null,
  opcao_id uuid references public.produto_opcao (id) on delete set null,
  nome_produto text not null,
  marca text not null,
  faixa public.faixa not null,
  -- O pai pediu outra faixa, que não existia ou estava indisponível.
  faixa_pedida public.faixa not null,
  preco_unitario_centavos integer not null check (preco_unitario_centavos > 0),
  quantidade integer not null check (quantidade between 1 and 99),
  -- O que a escola pediu: 0 quando o item foi adicionado pelo pai.
  quantidade_lista integer not null check (quantidade_lista >= 0),
  origem public.origem_item not null,
  ordem integer not null default 0,
  separado boolean not null default false,
  separado_em timestamptz,
  foreign key (fornecedor_id, pedido_id)
    references public.pedido (fornecedor_id, id) on delete cascade
);
create index on public.pedido_item (pedido_id, ordem);

create table public.pagamento (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null,
  pedido_id uuid not null,
  provedor text not null,
  metodo public.metodo_pagamento not null,
  status public.status_pagamento not null default 'pendente',
  valor_centavos integer not null check (valor_centavos > 0),
  parcelas integer not null default 1 check (parcelas between 1 and 12),
  id_externo text not null,
  -- Pix copia e cola, QR, URL do cartão: o que o provedor devolveu.
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- O webhook pode chegar duas vezes: a chave natural é o que o deixa idempotente.
  unique (provedor, id_externo),
  foreign key (fornecedor_id, pedido_id)
    references public.pedido (fornecedor_id, id) on delete cascade
);
create index on public.pagamento (pedido_id);

-- Histórico de status. Alimenta a linha do tempo do acompanhamento e é o
-- ponto onde a notificação por WhatsApp vai se pendurar.
create table public.pedido_evento (
  id bigint generated always as identity primary key,
  fornecedor_id uuid not null,
  pedido_id uuid not null,
  status_de public.status_pedido,
  status_para public.status_pedido not null,
  autor_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  foreign key (fornecedor_id, pedido_id)
    references public.pedido (fornecedor_id, id) on delete cascade
);
create index on public.pedido_evento (pedido_id, criado_em);

-- ------------------------------------------------------------------ gatilhos

create function app.tg_evento_somente_insercao() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'pedido_evento é somente inserção'
    using errcode = 'check_violation';
end $$;

create trigger evento_somente_insercao
  before update or delete on public.pedido_evento
  for each row execute function app.tg_evento_somente_insercao();

-- O preço é congelado na compra. Do item, só o checklist de separação muda.
-- produto_id e opcao_id podem virar nulos pelo "on delete set null" do
-- catálogo; trocar por outro valor, não.
create function app.tg_pedido_item_congelado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.fornecedor_id, new.pedido_id, new.nome_produto, new.marca,
      new.faixa, new.faixa_pedida, new.preco_unitario_centavos,
      new.quantidade, new.quantidade_lista, new.origem, new.ordem)
     is distinct from
     (old.id, old.fornecedor_id, old.pedido_id, old.nome_produto, old.marca,
      old.faixa, old.faixa_pedida, old.preco_unitario_centavos,
      old.quantidade, old.quantidade_lista, old.origem, old.ordem)
     or (new.produto_id is not null and new.produto_id is distinct from old.produto_id)
     or (new.opcao_id is not null and new.opcao_id is distinct from old.opcao_id)
  then
    raise exception 'item de pedido é congelado na compra'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger pedido_item_congelado
  before update on public.pedido_item
  for each row execute function app.tg_pedido_item_congelado();

-- Do pedido, mudam só o status e as datas que ele carrega.
create function app.tg_pedido_congelado() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.id, new.fornecedor_id, new.lista_id, new.numero, new.token,
      new.faixa_base, new.escola_nome, new.serie_nome, new.ano_letivo,
      new.aluno_nome, new.responsavel_nome, new.responsavel_whatsapp,
      new.modalidade, new.endereco, new.metodo_pagamento,
      new.subtotal_centavos, new.taxa_entrega_centavos, new.total_centavos,
      new.criado_em)
     is distinct from
     (old.id, old.fornecedor_id, old.lista_id, old.numero, old.token,
      old.faixa_base, old.escola_nome, old.serie_nome, old.ano_letivo,
      old.aluno_nome, old.responsavel_nome, old.responsavel_whatsapp,
      old.modalidade, old.endereco, old.metodo_pagamento,
      old.subtotal_centavos, old.taxa_entrega_centavos, old.total_centavos,
      old.criado_em)
  then
    raise exception 'pedido é congelado na compra: só o status muda'
      using errcode = 'check_violation';
  end if;
  new.atualizado_em := now();
  return new;
end $$;

create trigger pedido_congelado
  before update on public.pedido
  for each row execute function app.tg_pedido_congelado();
