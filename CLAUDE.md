@AGENTS.md

# Lista Pronta

SaaS em que papelarias vendem listas de material escolar. **Não é marketplace**: o pai chega
pelo link de UMA papelaria e só vê aquela. Protótipo de referência (fluxo, textos, visual):
`prototipo/lista-pronta.html`. Ele foi feito para uma loja só; o produto é multi-fornecedor.

## Regras que valem sempre

1. **Isolamento é do banco.** Toda tabela de domínio tem `fornecedor_id`, RLS ligado e
   FORÇADO, e política `app.eh_membro(fornecedor_id)`. Nunca confiar em filtro na tela.
   Tabela nova entra em `TABELAS` de `test/db/isolamento.test.ts`; o teste falha se faltar.
2. **O pai não tem conta e não toca tabela.** `anon` não tem privilégio em tabela nenhuma.
   Tudo passa por funções `security definer` em `20261005000003_area_publica.sql`. Hoje são
   cinco; função nova ali é decisão deliberada, e o teste lista as cinco por nome.
3. **O preço do pedido é do banco e é congelado.** O navegador manda a ESCOLHA (produto,
   faixa, quantidade), nunca o preço. `criar_pedido` lê o catálogo e grava cópia de nome,
   marca, faixa e preço. Gatilhos recusam alterar o pedido e o item depois; só o status e o
   checklist de separação mudam.
4. **Dinheiro é inteiro em centavos.** Só vira texto em `reais()` (`src/lib/dinheiro.ts`).
5. **A regra da faixa existe em dois lugares, e o teste os amarra.** `app.opcao_resolvida`
   (banco, vale no pedido) e `opcaoResolvida` (`src/lib/faixa.ts`, total na tela).
   `test/db/faixa-paridade.test.ts` compara as 81 combinações. Mudar uma sem a outra quebra.
6. **Filho referencia pai por `(fornecedor_id, id)`.** Chave composta: item de lista não
   aponta para produto de outra papelaria nem por engano.

## Decisões de produto (05/10/2026, padrões aprovados pelo Guilherme)

- **Faixa ausente ou indisponível**: vale a mais próxima ABAIXO; sem nenhuma abaixo, a mais
  próxima acima. O item registra `faixa_pedida` além da `faixa`, para a tela dizer
  "faixa substituída".
- **Lista é da série E do ano letivo** (`unique (serie_id, ano_letivo)`), e no máximo uma
  publicada por série (índice parcial). Encerrar, não apagar: pedidos antigos a referenciam.
- **Entrega**: taxa fixa por papelaria (`taxa_entrega_centavos`) e endereço livre.
- **Estoque**: `disponivel` sim/não por opção. Sem quantidade em estoque.
- **"Adicionar item que faltou"** vem do catálogo inteiro da papelaria (`vitrine_catalogo`).
- **Pix não pago expira em 30 minutos** (`pedido.expira_em`). `pedido_por_token` já mostra
  "expirado"; o job que grava o status expirado é pendência.
- **Produto que está em lista não se apaga** (`on delete restrict`). Fora de lista, pode, e
  o pedido continua inteiro (o item guarda a cópia; `produto_id` vira nulo).

## Do protótipo, o que NÃO entra agora

O protótipo tem leitura de lista por foto e por texto colado, e a fila "Itens não
encontrados" que nasce dela. **Importação de lista está fora do escopo**: no produto o pai
sempre parte de uma lista que a papelaria cadastrou, e por isso não existe item "em
análise". Também ficam fora: gateway real e split, envio de WhatsApp (o ponto de integração é
`pedido_evento`), marketplace.

## Testes

`pnpm test` sobe um banco descartável num **Postgres comum** (`TEST_DATABASE_URL`) e aplica
`test/db/supabase-local.sql` (simula papéis e `auth.uid()` do Supabase), as migrações e o
seed duas vezes (o seed é idempotente). Cada teste roda numa transação desfeita no fim.

- **RLS não ERRA em update/delete: não encontra a linha.** A asserção é `rowCount === 0`.
- **Confira que o teste pega o defeito.** As guardas de isolamento, congelamento e `anon`
  foram conferidas quebrando a regra de propósito; teste que passa com a regra quebrada não
  olha nada.

## Supabase de verdade

Não usar o projeto de outro produto. O Supabase concede tudo em `public` a `anon` e
`authenticated` por padrão (inclusive para tabelas e funções FUTURAS): toda migração nova
revoga e concede explicitamente. Conta de papelaria nasce pela API de autenticação, nunca por
insert em `auth.users`.

## Convenções

Domínio em português (`fornecedor`, `pedido`, `lista_item`); infraestrutura em inglês.
Interface toda em pt-BR, valores em R$. Cores, fontes e raios só em `src/app/globals.css`
(`@theme`), vindos do protótipo. Mobile-first na área do pai.

## Etapas

| | Etapa | Situação |
|---|---|---|
| a | Setup, schema, RLS, funções públicas, seed, testes | **concluída** |
| b | Área do pai: escola → série → faixa → revisão → checkout → pagamento fake → acompanhamento | |
| c | Login do fornecedor, painel de pedidos, separação, status | |
| d | Cadastro de catálogo, escolas, séries e listas | |

Pare ao fim de cada etapa, diga como testar e o que ficou pendente.
