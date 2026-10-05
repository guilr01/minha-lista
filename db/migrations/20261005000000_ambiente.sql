-- Lista Pronta: o ambiente sobre o qual o resto se apoia.
--
-- Num Postgres comum (Neon), nada disto vem pronto. Três peças:
--
--   * dois papéis sem login, `anon` (o pai) e `authenticated` (a papelaria).
--     A aplicação conecta como o DONO do banco e, a cada requisição, troca
--     para um deles com `set local role` (src/lib/db.ts). É dentro deles que
--     o RLS vale;
--   * o DONO do banco é o papel do sistema: dono das tabelas e das funções
--     `security definer`, por isso o RLS não se aplica a ele (as tabelas não
--     usam FORCE). Ele só é usado direto em migração, seed e webhook;
--   * `app.usuario_atual()`: quem é o usuário da requisição, lido de uma
--     configuração da TRANSAÇÃO (`app.usuario_id`). Transação, e não sessão,
--     porque o pooler do Neon reaproveita conexões entre requisições.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
end $$;

-- O dono precisa poder vestir os dois papéis.
grant anon, authenticated to current_user;

revoke all on schema public from public;
grant usage on schema public to anon, authenticated;

create schema if not exists app;
revoke all on schema app from public;

-- Conta de quem acessa o painel. Mora em `app`, não em `public`: nenhum dos
-- dois papéis lê esta tabela; login e cadastro são funções (etapa c).
create table app.usuario (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email like '%_@_%'),
  nome text,
  criado_em timestamptz not null default now()
);

create function app.usuario_atual() returns uuid
language sql stable set search_path = '' as $$
  select nullif(current_setting('app.usuario_id', true), '')::uuid
$$;
