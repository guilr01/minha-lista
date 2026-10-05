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
7. **Só `src/lib/db.ts` conecta ao banco**, e toda operação escolhe o papel: `comoPai`
   (anon), `comoUsuario` (authenticated + `app.usuario_id`) ou `comoSistema` (o dono, sem
   RLS). `test/acesso.test.ts` falha se outro arquivo importar `pg`, e a lista de quem usa
   `comoSistema` é fechada: hoje, pagamento e a leitura da cobrança.
8. **Um só caminho marca pedido como pago**: `aplicarEventoDePagamento`
   (`src/lib/pagamento/processar.ts`) → `app.confirmar_pagamento`, idempotente. O webhook e
   a simulação do provedor falso passam por ele.
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
- **Parcelas**: até `fornecedor.parcelas_maximas` (3 no seed, como no protótipo). Pix é 1.
- **"Faixa mista"** é só quando o pai TROCOU a faixa de um item. Item que caiu de faixa por
  não ter a escolhida segue com a escolha, e a tela avisa no item.
- **Preço mudou entre a tela e a compra**: `criar_pedido` recebe `total_esperado_centavos` e
  recusa com `preco_mudou`; a tela recarrega os preços sem perder o carrinho.
- **Cartão nunca passa pelo nosso servidor**: o provedor devolve `urlCartao`, a página do
  próprio gateway. O falso imita essa página em `/pagamento-fake/[id]`.
- **Simulação de pagamento em produção** só com `PAGAMENTO_FAKE_LIBERADO=1`: sem isso,
  qualquer pessoa levaria o material sem pagar. O webhook do falso segue a mesma regra.
- **Produto que está em lista não se apaga** (`on delete restrict`). Fora de lista, pode, e
  o pedido continua inteiro (o item guarda a cópia; `produto_id` vira nulo).

## Do protótipo, o que NÃO entra agora

O protótipo tem leitura de lista por foto e por texto colado, e a fila "Itens não
encontrados" que nasce dela. **Importação de lista está fora do escopo**: no produto o pai
sempre parte de uma lista que a papelaria cadastrou, e por isso não existe item "em
análise". Também ficam fora: gateway real e split, envio de WhatsApp (o ponto de integração é
`pedido_evento`), marketplace.

## Testes

`pnpm test` sobe um banco descartável num **Postgres comum** (`TEST_DATABASE_URL`, usuário
administrador), com dono `lp_dono` sem superusuário, e aplica as migrações e o seed duas vezes
(o seed é idempotente). Cada teste roda numa transação desfeita no fim.

- **O total da tela é o total cobrado**: `test/db/carrinho-paridade.test.ts` passa o total de
  `src/lib/carrinho.ts` como `total_esperado_centavos` em 200 carrinhos sorteados.

- **RLS não ERRA em update/delete: não encontra a linha.** A asserção é `rowCount === 0`.
- **Confira que o teste pega o defeito.** As guardas de isolamento, congelamento e `anon`
  foram conferidas quebrando a regra de propósito; teste que passa com a regra quebrada não
  olha nada.

## Banco: Neon (decisão de 05/10/2026)

O plano gratuito do Supabase estava no limite de 2 projetos ativos, e os dois (`kaisa` e
`wod-coach`) estão em uso diário. O banco é **Postgres no Neon**; o projeto do Neon se chama
"minha lista". Nada do Supabase ficou: papéis, `app.usuario` e `app.usuario_atual()` são
criados pela migração `20261005000000_ambiente.sql`.

- **O dono do banco NÃO é superusuário no Neon, e isso decide o desenho.** As tabelas usam
  RLS sem `FORCE`: com `FORCE`, o próprio dono passa pelo RLS e as funções `security definer`
  enxergam zero linhas (medido: nem o seed entra). O dono é o papel do sistema.
- **Os testes rodam como `lp_dono`, sem superusuário**, e há teste que afirma isso.
  Superusuário ignora o RLS: rodar os testes com ele esconde exatamente o defeito acima.
- **`app.usuario_id` é configuração da TRANSAÇÃO** (`set_config(..., true)`), nunca da sessão:
  o pooler do Neon reaproveita conexões entre requisições.
- `pnpm db:migrar` aplica pendentes pelo MESMO `scripts/banco.mjs` que monta o banco dos
  testes. Contra o Neon de produção, vale na hora.
- Login da papelaria (etapa c): o Neon tem Better Auth gerenciado (Neon Auth). Avaliar antes
  de escrever login próprio. Skills do Neon em `.claude/skills/`.

## Convenções

Domínio em português (`fornecedor`, `pedido`, `lista_item`); infraestrutura em inglês.
Interface toda em pt-BR, valores em R$. Cores, fontes e raios só em `src/app/globals.css`
(`@theme`), vindos do protótipo. Mobile-first na área do pai.

## Etapas

| | Etapa | Situação |
|---|---|---|
| a | Setup, schema, RLS, funções públicas, seed, testes | **concluída** |
| b | Área do pai: escola → série → faixa → revisão → checkout → pagamento fake → acompanhamento | **concluída** (falta aplicar no Neon) |
| c | Login do fornecedor, painel de pedidos, separação, status | |
| d | Cadastro de catálogo, escolas, séries e listas | |

Pare ao fim de cada etapa, diga como testar e o que ficou pendente.
