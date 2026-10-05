# Lista Pronta

Plataforma em que papelarias vendem listas de material escolar online. Cada
papelaria tem a própria conta e o próprio link; o pai abre o link, escolhe
escola e série, escolhe uma faixa de preço (econômica, intermediária,
premium), ajusta item a item, paga e acompanha o pedido, sem criar conta.

Protótipo de referência: `prototipo/lista-pronta.html` (abre direto no navegador).

## Stack

Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, RLS,
Storage) · Vercel. Pagamento atrás da interface `PaymentProvider`, com uma
implementação falsa para desenvolvimento.

## Rodar

```bash
pnpm install
cp .env.example .env.local   # preencha com o projeto Supabase
pnpm dev
```

## Banco

As migrações em `supabase/migrations` são a única definição do schema.
`supabase/seed.sql` traz os dados de exemplo (1 papelaria, 2 escolas,
4 séries, 22 produtos) e pode rodar quantas vezes for preciso.

Aplicar no projeto Supabase (com o CLI):

```bash
supabase db push --db-url "$DATABASE_URL"
psql "$DATABASE_URL" -f supabase/seed.sql
```

## Testes

Os testes de banco rodam num **Postgres comum**, sem Docker nem Supabase:
`test/db/supabase-local.sql` simula os papéis `anon` e `authenticated` e o
`auth.uid()`, e o setup aplica as mesmas migrações e o seed num banco
descartável (`lista_pronta_teste`).

```bash
export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
pnpm test        # isolamento entre papelarias, vitrine, pedido, paridade da faixa
pnpm typecheck && pnpm lint && pnpm build
```
