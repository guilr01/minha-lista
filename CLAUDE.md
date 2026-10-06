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
7. **Só `src/lib/db.ts` conecta ao banco**, e toda operação escolhe o papel: `comoPai`
   (anon), `comoUsuario` (authenticated + `app.usuario_id`) ou `comoSistema` (o dono, sem
   RLS). `test/acesso.test.ts` falha se outro arquivo importar `pg`, e a lista de quem usa
   `comoSistema` é fechada: hoje, pagamento e a leitura da cobrança.
8. **Um só caminho marca pedido como pago**: `aplicarEventoDePagamento`
   (`src/lib/pagamento/processar.ts`) → `app.confirmar_pagamento`, idempotente. O webhook e
   a simulação do provedor falso passam por ele.
9. **Pedido pago só anda por duas funções**: `marcar_item_separado` e `avancar_pedido`
   (migração 0005). Elas conferem a papelaria (`app.eh_membro`), o estado e a transição, recusam
   despachar com item faltando e gravam o autor na trilha. O fornecedor não tem mais `update` em
   `pedido_item`. Pedido de outra papelaria responde como inexistente.
10. **Toda ação do painel chama `exigirUsuario()`** (`src/lib/sessao.ts`). O layout barrar a
   página não protege a Server Action, que é um endpoint público.

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

## Login da papelaria (decisão de 05/10/2026: login próprio)

O Neon Auth está ligado no projeto, mas as sessões na nuvem não o alcançam (proxy, 403), e
login que não se testa aqui seria escrito às cegas. O Guilherme escolheu login próprio; dá para
migrar para o Neon Auth depois.

- **Senha**: scrypt com sal em `src/lib/senha.ts`, a ÚNICA definição; a aplicação e
  `scripts/criar-acesso.mjs` importam de lá. O banco só vê o resultado.
- **Sessão**: token aleatório de 32 bytes no cookie `lp_sessao` (httpOnly, sameSite lax, 30
  dias); o banco guarda o SHA-256 em `app.sessao`. Ler a tabela não dá sessão a ninguém.
- **Limite**: 5 senhas erradas por e-mail ou 20 por origem em 15 minutos trancam por 15
  minutos (`app.falha_login`, origem em sha256). Acertar limpa as falhas do e-mail. E-mail
  inexistente gasta o mesmo scrypt, para a resposta não denunciar quem tem conta.
- **Cadastro** cria pessoa, papelaria e vínculo numa transação só. Para ligar alguém a uma
  papelaria que já existe (a do seed), `scripts/criar-acesso.mjs`; com `--sql` ele imprime os
  comandos para o conector do Neon.
- **Falta**: recuperar senha por e-mail (não há provedor de e-mail; por ora o script troca a
  senha), mais de uma papelaria por pessoa na tela (o banco já aceita).

## Publicação: Vercel (06/10/2026)

Projeto `minha-lista` na Vercel (equipe "Guil_R's projects"), ligado ao GitHub: **cada envio
para o `main` publica sozinho em produção.** Funções em São Paulo (`gru1`, `vercel.json`),
perto do banco.

| Variável | Valor | Para quê |
|---|---|---|
| `DATABASE_URL` | string POOLED do Neon (sensível) | o banco |
| `PAGAMENTO_PROVEDOR` | `fake` | sem gateway real ainda |
| `PAGAMENTO_FAKE_LIBERADO` | `1` | **liga o "Simular pagamento aprovado" em produção** |

**`PAGAMENTO_FAKE_LIBERADO=1` está ligado de propósito, para testar o fluxo inteiro no
celular, e é a primeira coisa a tirar antes de vender de verdade**: com ele, qualquer pessoa
com o link gera pedido "pago" sem dinheiro. Variável nova ou alterada só vale depois de uma
publicação nova.

Migração continua indo ao Neon à parte (ver "Aplicar migração no Neon"): a Vercel publica o
código, não o schema. **Aplique a migração ANTES de enviar o código que depende dela.**

## Cadastro da papelaria (etapa d, 06/10/2026)

- **Escrita direta, e o RLS decide**: produto, opção, escola, série, lista e item são `insert`/
  `update`/`delete` como `authenticated` (`src/lib/cadastro.ts`). Só o STATUS da lista tem regra
  própria, em `publicar_lista` e `encerrar_lista` (migração 0006): `security invoker`, para o RLS
  valer dentro delas. Lista vazia não publica, e publicar encerra a que estava no ar na mesma
  série, na mesma transação.
- **Os totais do editor de lista saem de `src/lib/carrinho.ts`**, a mesma conta da vitrine. A
  papelaria vê o que os pais vão ver; uma segunda conta ali divergiria no primeiro ajuste.
- **Faixa com marca e preço em branco = a papelaria não vende essa faixa daquele item.**
- **Produto em lista não se exclui** (a tela manda desativar); série com lista e lista com pedido
  também não. Só rascunho se exclui. Copiar a lista do ano anterior leva itens e recado.
- **O endereço (slug) de escola e série vem do nome**, sem o ordinal ("3º ano" → `3-ano`), e
  repetido vira `-2`. A tela do pai depende disso: é o link que a papelaria divulga.
- **`FormAcao` envia por conta própria** (`src/components/form-acao.tsx`). No React 19 o
  `<form action>` é LIMPO depois do envio mesmo quando o banco recusa; a papelaria perderia o
  produto inteiro por um preço inválido.

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

- **Os testes de `src/lib` que usam `db.ts` gravam de verdade** no banco de teste (login,
  lista do painel): use dados únicos e nunca suponha o estado de outro arquivo. Um teste antigo
  supunha o pedido #1001 e quebrou quando a ordem dos arquivos mudou; rode com
  `--sequence.shuffle` ao mexer nisso.
- **Rode a suíte no Postgres 18 antes de enviar** (`docker run -p 5433:5432 postgres:18` e
  `TEST_DATABASE_URL=...:5433/postgres pnpm test`). O Neon é 18 e o Postgres local deste
  ambiente é 16. Foi assim que apareceu: no 18, `ON DELETE RESTRICT` recusa com o código
  **23001**, não 23503, e a mensagem "desative o produto" virava o erro cru do banco.
- **O driver `pg` não converte array de ENUM**: devolve a string `"{premium}"`. Converta para
  `text[]` no SQL. Foi assim que todo pedido apareceu como faixa "Mista" no painel.
- **O total da tela é o total cobrado**: `test/db/carrinho-paridade.test.ts` passa o total de
  `src/lib/carrinho.ts` como `total_esperado_centavos` em 200 carrinhos sorteados.

- **RLS não ERRA em update/delete: não encontra a linha.** A asserção é `rowCount === 0`.
- **Confira que o teste pega o defeito.** As guardas de isolamento, congelamento e `anon`
  foram conferidas quebrando a regra de propósito; teste que passa com a regra quebrada não
  olha nada.

## Banco: Neon (decisão de 05/10/2026)

O plano gratuito do Supabase estava no limite de 2 projetos ativos, e os dois (`kaisa` e
`wod-coach`) estão em uso diário. O banco é **Postgres no Neon**: projeto "Minha lista"
(`odd-bird-95021023`), região `aws-sa-east-1`, **Postgres 18**, banco `neondb`. Nada do Supabase
ficou: papéis, `app.usuario` e `app.usuario_atual()` são criados pela migração
`20261005000000_ambiente.sql`. **As 5 migrações e o seed estão aplicados desde 05/10/2026.**

- **O dono no Neon (`neondb_owner`) não é superusuário, mas TEM `BYPASSRLS`** (medido). O
  desenho não depende disso: as tabelas usam RLS sem `FORCE`, o dono é o papel do sistema, e
  cada requisição troca para `anon` ou `authenticated` em `src/lib/db.ts`.
- **Os testes rodam como `lp_dono`, sem superusuário E sem `BYPASSRLS`**, o caso mais estrito,
  e há teste que afirma isso. Com esse dono, ligar `FORCE` derruba até o seed (medido); com
  superusuário, o RLS seria ignorado e os testes não provariam nada.
- **`app.usuario_id` é configuração da TRANSAÇÃO** (`set_config(..., true)`), nunca da sessão:
  o pooler do Neon reaproveita conexões entre requisições.
- **O projeto já tem o Neon Auth ligado** (schema `neon_auth`, Better Auth gerenciado). As
  nossas migrações não tocam nele. Avaliar para o login da etapa (c) antes de escrever um
  próprio. Skills do Neon em `.claude/skills/`.
- **No Postgres 18 os `NOT NULL` também viram restrição no catálogo** (`contype = 'n'`). A CI
  roda Postgres 18, como a produção; os 54 testes passam no 16 e no 18.

### Aplicar migração no Neon

`pnpm db:migrar` (com `DATABASE_URL`) aplica as pendentes pelo MESMO `scripts/banco.mjs` que
monta o banco dos testes. Contra o Neon de produção, vale na hora.

**Das sessões na nuvem do Claude Code, o Neon NÃO é alcançável direto**: a porta 5432 está
bloqueada e o proxy recusa o WebSocket (403). Nelas, aplica-se pelo **conector do Neon**
(`run_sql_transaction`), que aceita uma lista de comandos e não um arquivo:

1. `node scripts/neon/gerar-comandos.mjs db/migrations/<arquivo>.sql <arquivo>.sql` gera a
   lista, já com o registro em `controle.migracao`, para os dois entrarem na mesma transação.
2. Aplicar a lista com `run_sql_transaction`.
3. **Provar a transcrição**: rodar `scripts/neon/impressao-schema.sql` no Neon e num banco local
   montado por `scripts/banco.mjs`; os hashes precisam bater. No seed, `impressao-dados.sql`.

Foi assim que as 5 migrações e o seed entraram, e os hashes bateram em todas as partes.

## Convenções

Domínio em português (`fornecedor`, `pedido`, `lista_item`); infraestrutura em inglês.
Interface toda em pt-BR, valores em R$. Cores, fontes e raios só em `src/app/globals.css`
(`@theme`), vindos do protótipo. Mobile-first na área do pai.

## Etapas

| | Etapa | Situação |
|---|---|---|
| a | Setup, schema, RLS, funções públicas, seed, testes | **concluída** |
| b | Área do pai: escola → série → faixa → revisão → checkout → pagamento fake → acompanhamento | **concluída**, aplicada no Neon |
| c | Login do fornecedor, painel de pedidos, separação, status | **concluída**, aplicada no Neon |
| d | Cadastro de catálogo, escolas, séries e listas | **concluída**, aplicada no Neon |

Pare ao fim de cada etapa, diga como testar e o que ficou pendente.
