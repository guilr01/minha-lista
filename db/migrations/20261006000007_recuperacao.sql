-- Lista Pronta: recuperar a senha por e-mail.
--
-- O link leva um token aleatório de 32 bytes; o banco guarda o SHA-256 dele,
-- como em app.sessao, para ler esta tabela não dar troca de senha a ninguém.
-- Vale por 1 hora e uma vez só. Pedir de novo invalida o anterior.
--
-- Nada aqui é lido pelos papéis da requisição: é do sistema, como o login.

create table app.recuperacao_senha (
  -- sha256 do token, em hexadecimal
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  usuario_id uuid not null references app.usuario (id) on delete cascade,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usada_em timestamptz
);
create index on app.recuperacao_senha (usuario_id);

-- Todo pedido de recuperação, com ou sem conta por trás, para o limite: sem
-- ele, o formulário vira um jeito de mandar e-mail em massa para alguém.
-- Guarda o e-mail digitado e um hash da origem, como app.falha_login.
create table app.pedido_recuperacao (
  id bigint generated always as identity primary key,
  email text not null,
  origem text,
  em timestamptz not null default now()
);
create index on app.pedido_recuperacao (email, em);
create index on app.pedido_recuperacao (origem, em);
