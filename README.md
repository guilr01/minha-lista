# Lista Pronta

Plataforma em que papelarias vendem listas de material escolar online. Cada
papelaria tem a própria conta e o próprio link; o pai abre o link, escolhe
escola e série, escolhe uma faixa de preço (econômica, intermediária,
premium), ajusta item a item, paga e acompanha o pedido, sem criar conta.

Protótipo de referência: `prototipo/lista-pronta.html` (abre direto no navegador).

## Stack

Next.js (App Router) · TypeScript · Tailwind · Postgres no Neon, com RLS ·
Vercel. Pagamento atrás da interface `PaymentProvider`
(`src/lib/pagamento`), com uma implementação falsa para desenvolvimento.

## Rodar

```bash
pnpm install
cp .env.example .env.local   # DATABASE_URL do Neon (pooled)
pnpm db:migrar               # aplica as migrações pendentes
pnpm db:semear               # dados de exemplo (idempotente)
pnpm dev
```

Área do pai: `http://localhost:3000/papelaria-central`. Painel da papelaria:
`http://localhost:3000/entrar` (ou `/cadastro`, que cria uma papelaria nova).

Para dar acesso à papelaria do seed (ou trocar uma senha):

```bash
SENHA='...' node --experimental-strip-types scripts/criar-acesso.mjs \
  --email dona@papelaria.com --papelaria papelaria-central --nome "Maria"
```

No painel, a papelaria cadastra o catálogo (até três faixas por item), as
escolas e séries, monta a lista de cada série por ano letivo e a publica. Com o provedor falso, a tela
do Pix tem o botão "Simular pagamento aprovado", e o cartão abre uma página
de teste no lugar do gateway.

## Banco

`db/migrations` é a única definição do schema; `scripts/banco.mjs` as aplica
em ordem, cada uma na sua transação, e registra em `controle.migracao`.
**`pnpm db:migrar` contra o Neon de produção vale na hora.**

## Testes

Os testes de banco rodam num **Postgres comum**, sem Docker nem Neon. O setup
cria um banco descartável (`lista_pronta_teste`) cujo dono é um usuário SEM
superusuário (`lp_dono`), como no Neon, e aplica nele as mesmas migrações e o
seed, pelo mesmo `scripts/banco.mjs`.

```bash
export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres
pnpm test && pnpm typecheck && pnpm lint && pnpm build
```
