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
- **Recuperar a senha** (06/10/2026, migração 0007): `/entrar/esqueci` → e-mail com link
  `/entrar/redefinir/<token>`. Token de 32 bytes, o banco guarda o SHA-256
  (`app.recuperacao_senha`); vale **1 hora e uma vez só**, e pedir de novo invalida o anterior.
  Trocar a senha **encerra todas as sessões** da conta e limpa as senhas erradas (senão quem
  estava trancado seguiria trancado com a senha nova). A tela responde igual com ou sem conta, e o e-mail sai DEPOIS da
  resposta (`after`), para nem o tempo denunciar quem tem conta. Limite: 3 pedidos por e-mail ou
  10 por origem por hora (`app.pedido_recuperacao`), em silêncio.
- **O link do e-mail NÃO usa o cabeçalho Host** (`src/lib/endereco.ts`): um Host forjado levaria
  o token da vítima para o domínio de quem atacou. Vem de `URL_PUBLICA` ou do domínio de produção
  que a Vercel injeta; fora da Vercel, em produção, sem `URL_PUBLICA` ele recusa.
- **E-mail** sai por `src/lib/email.ts`, provedor Resend, ligado por `RESEND_API_KEY` e
  `EMAIL_REMETENTE`. Sem as duas, nada é enviado: no desenvolvimento o link vai para o log do
  servidor; em produção o log diz só que não foi enviado, sem o link.
- **Falta**: mais de uma papelaria por pessoa na tela (o banco já aceita).

## Publicação: Vercel (06/10/2026)

Projeto `minha-lista` na Vercel (equipe "Guil_R's projects"), ligado ao GitHub: **cada envio
para o `main` publica sozinho em produção.** Funções em São Paulo (`gru1`, `vercel.json`),
perto do banco.

| Variável | Valor | Para quê |
|---|---|---|
| `DATABASE_URL` | string POOLED do Neon (sensível) | o banco |
| `PAGAMENTO_PROVEDOR` | `fake` | sem gateway real ainda |
| `PAGAMENTO_FAKE_LIBERADO` | `1` | **liga o "Simular pagamento aprovado" em produção** |
| `RESEND_API_KEY` | chave do Resend (sensível, só produção) | e-mail de recuperação de senha |
| `EMAIL_REMETENTE` | `Lista Pronta <onboarding@resend.dev>` (sensível, só produção) | remetente |

**O e-mail funciona desde 06/10/2026, mas só para o dono da conta do Resend**: sem domínio
verificado, o Resend recusa qualquer outro destinatário. Para valer para toda papelaria: verificar
um domínio no Resend (região São Paulo) e trocar `EMAIL_REMETENTE` para um endereço dele.
| `URL_PUBLICA` | opcional, ex.: `https://listapronta.com.br` | só com domínio próprio; sem ela vale o domínio de produção da Vercel |

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

## Ajustes do Guilherme (19/10/2026)

- **A página inicial (`/`) é o cadastro da PAPELARIA.** Os pais nunca chegam nela: chegam pelo
  link da papelaria. `/cadastro` redireciona para `/#cadastro`, para quem tem o link antigo.
- **A vitrine dos pais é uma caixa só**: seletor de escola e, embaixo, o seletor da série
  (`src/app/[papelaria]/escolha.tsx`). Sem JavaScript, o seletor volta para a página com
  `?escola=` e o servidor já traz a escola escolhida. As séries continuam links de verdade.
- **O pedido dos pais tem TRÊS passos**: (1) lista e faixa na mesma tela, só leitura, com a marca
  de cada item na faixa escolhida; (2) revisão, onde se tira, muda quantidade, troca a faixa de um
  item e inclui outro; (3) entrega e pagamento. `?etapa=4` antigo cai no 3.
- **Painel**: o pedido abre por um botão "Abrir pedido", não pelo número. "Imprimir lista e
  etiqueta" virou **"Imprimir pedido"**: a folha é a lista de conferência e, no pé, a
  identificação do kit; a palavra "etiqueta" fazia pensar em adesivo.
- **WhatsApp ao cliente: NÃO há envio automático, e nunca houve.** `notificarMudancaDeStatus`
  só escreve no log (envio de WhatsApp está fora do escopo). O que existe é o botão **"Avisar o
  cliente no WhatsApp"** no pedido: abre o WhatsApp DA PAPELARIA com a mensagem do status atual e
  o link de acompanhamento, escrita por `mensagemDeStatus` (`src/lib/status.ts`). Quem envia é a
  papelaria; a tela diz isso.
- **`/painel/divulgar`**: o link da loja (copiar, mandar pelo WhatsApp), o QR code (baixar em
  PNG, imprimir cartaz para o balcão) e o link de cada série publicada. A lista de séries vem da
  MESMA vitrine que os pais veem: só aparece o que de fato abre lá.

## Catálogo pelo Excel (19/10/2026)

- **`/painel/catalogo/importar`**: baixa o modelo (ou o catálogo atual, no mesmo formato), sobe o
  `.xlsx`, CONFERE (mostra novos, atualizados e as linhas com problema, sem gravar) e só então
  importa. Os dois passos recebem o MESMO arquivo e o leem de novo no servidor.
- **Uma linha por produto**: Produto · marca e preço de cada faixa. A leitura é pelo TÍTULO da
  coluna, não pela posição (`src/lib/planilha-catalogo.ts`); planilha antiga com Categoria e
  Unidade ainda é lida, e essas colunas são ignoradas.
- **Regras da gravação** (`importarCatalogo` em `src/lib/cadastro.ts`), todas numa transação só:
  nome igual (sem caixa, acento e espaço extra) ATUALIZA; o resto é criado; faixa em branco NÃO
  mexe na faixa cadastrada; **nada é apagado**.
  Apagar por omissão numa planilha seria fácil demais de fazer sem querer.
- **Linha com problema não entra, e as outras podem entrar**: a tela diz quantas ficam de fora.
- O download fica em `/api/catalogo/planilha` (rota, não página; o lint recusa `<a>` para página).
- O corpo de Server Action foi a 4 MB (`next.config.ts`), abaixo do teto de 4,5 MB da Vercel; o
  arquivo é limitado a 3 MB e 3.000 produtos.

- **Sem categoria e sem unidade** (decisão do Guilherme, 19/10/2026): cada produto conta como 1
  item (o pacote de 100 folhas é 1, não 100), e a categoria não ajudava ninguém. Saíram do
  formulário, da lista do catálogo, da planilha e da tela dos pais. As colunas `produto.categoria`
  e `produto.unidade` ficam no banco, sem uso, para não perder o que já foi cadastrado.
- **A vitrine dos pais tem DUAS listas suspensas**: escola e, depois dela, a série; o botão "Ver a
  lista" leva ao link da série.

## Descontos da papelaria (19/10/2026, migração 0008)

- **Quatro regras, cada uma ligada ou não, com o percentual da papelaria** (card "Descontos" na
  Loja): lista completa · pagamento no Pix · valor mínimo (a partir de R$ X) · faixa da lista
  (todos os itens escolhidos na faixa Y). Guardadas em `fornecedor.descontos` (jsonb), validadas
  por `app.descontos_validos` numa restrição: percentual inteiro de 1 a 50.
- **Lista completa**: todo item da lista que está à venda, na quantidade da escola OU MAIS. Trocar
  faixa e incluir itens não tira o desconto; item fora de venda não conta.
- **As regras cumpridas se SOMAM, com teto de 50%**, e valem só sobre os PRODUTOS (a entrega fica
  fora). O valor é truncado no centavo (`subtotal * % / 100`), para nunca passar do teto; há uma
  restrição no pedido que garante isso.
- **A regra existe em DOIS lugares, e o teste os amarra**, como a da faixa: `app.descontos_aplicados`
  (banco, cobra) e `descontoDoPedido` (`src/lib/desconto.ts`, tela). `test/db/carrinho-paridade.test.ts`
  sorteia 300 carrinhos e exige o mesmo valor e as mesmas regras, e exige que cada regra E o teto
  tenham valido em algum carrinho. Tela sem o desconto é recusada com `preco_mudou`.
- **O pedido congela o desconto**: `pedido.desconto_centavos` e `pedido.descontos` (as regras que
  valeram) entram no gatilho de congelamento. O total passa a ser produtos − desconto + entrega.

## Lista da escola e séries padrão (19/10/2026)

- **A série vem de uma lista pronta** (`src/lib/series.ts`): 1º ao 9º ano e 1ª a 3ª série do
  Ensino Médio, com "Outra série (digitar)" para o resto. A posição na lista vira `serie.ordem`, e
  a série digitada vai depois de todas (ordem ≥ 100).
- **Importar a lista da escola entrou** (decisão do Guilherme, 19/10/2026), e com isso deixa de
  valer o "importação de lista fora do escopo" de 05/10. Continua de fora a FOTO: ler imagem
  exigiria reconhecimento de texto. Entra PDF com texto, Word (.docx), Excel, CSV, .txt e texto
  colado (`src/lib/arquivo-de-lista.ts`).
- **A comparação SUGERE, a papelaria DECIDE** (`src/lib/lista-da-escola.ts`): `lerLinhas` separa
  quantidade (no começo, no fim ou por extenso), descrição e o que vem entre parênteses (vira
  observação); `sugerir` dá os 3 produtos mais parecidos por palavras em comum, sem acento, plural
  e abreviação, com a primeira palavra pesando ("o que é") e número que contradiz pesando contra.
  Abaixo de `NOTA_MINIMA` a linha começa como indisponível.
- **Item ou texto (20/10/2026, era o gargalo do cadastro de listas).** A primeira versão tratava
  TODA linha como item: recado, endereço, data e "Observações" viravam "item indisponível" e iam
  parar no recado que o cliente lê, e lista em parágrafo ("os alunos deverão trazer caderno, lápis
  e borracha") virava um item só. Agora cada trecho é `item: true | false`, e o que decide é o
  conjunto, não o formato da linha: quantidade, começar por um objeto (vocabulário próprio MAIS a
  primeira palavra de cada produto do catálogo da loja), fala de recado (`FRASE`: "deverá",
  "solicitamos", "todos"), fala da escola (`CONTEXTO`), data, contato, e a SEÇÃO em que está
  ("Observações:" é texto; "Material de uso individual:" é lista). Texto corrido é cortado no verbo
  que abre a lista (`INTRODUTOR`) e dividido em vírgula, ponto e vírgula e "e", **juntando de
  volta o que é continuação**: "2 cadernos brochura, capa dura, 96 folhas" é UM item, e "papel
  crepom azul e amarelo" também. Parágrafo que o PDF quebrou no fim da linha volta a ser uma frase.
- **O que não parece item NÃO some**: vai para um bloco recolhido na conferência, com "É um item"
  para trazer de volta. Errar para o lado de esconder sem mostrar seria pior que o defeito antigo.
- **Regras tiradas de quatro listas reais (20/10/2026)**, uma por padrão, que estão como fixture em
  `test/fixtures/listas-de-escolas/` (contatos trocados por fictícios) e são afirmadas item por item
  em `test/listas-reais.test.ts`. Mexeu numa regra, rode esse arquivo: frase que vira item quebra.
  - **Livro NÃO entra** (decisão do Guilherme): sai com `motivo: "livro"`, em grupo próprio na tela.
    Três jeitos de reconhecer, porque as listas usam os três: começa por livro ("Livro:",
    dicionário, atlas, apostila, gramática, sistema de ensino); tem editora, ISBN ou edição; ou está
    debaixo de "LIVROS"/"Literatura"/"Paradidáticos". O título SEM marca nenhuma ("Capitães de
    areia") sai porque a linha de baixo é "Autor:"/"Editora:"/"ISBN:", e a ficha gruda no título.
  - **Comprado na própria escola** ("adquirida no Colégio") sai com `motivo: "escola"`: o cliente
    não compra na papelaria, e "indisponível" no recado o faria procurar.
  - **Instrução colada no item** ("- colocar o nome completo do(a) aluno(a)", ", devidamente
    identificada", "para ser utilizado nas aulas", "sugestão Canson") vai para a OBSERVAÇÃO: o
    cliente lê, e a comparação com o catálogo não tropeça nela.
  - **Sem quantidade, só passa o que COMEÇA por um objeto.** A regra antiga ("até 10 palavras
    numa seção de lista é item") deixava passar "Uso de tênis" e título de livro.
  - **Debaixo de "Importante"/"Observações" não se garimpa item em parágrafo**, e "2. Trazer…" é
    numeração, não quantidade.
  - **A planilha é lida por COLUNA** (`arquivo-de-lista.ts`): coluna de preço pelo título ou por ter
    centavos, coluna de quantidade por só ter inteiros pequenos. Lida pela posição, o preço do livro
    (70) virava a quantidade dele. Texto separado por muitos espaços na mesma célula ("…   Inglês")
    é outra coluna e vira observação. Duas linhas vazias encerram a seção.
  - **Previstos, sem lista real ainda**: caixinha de marcar "( )", pontilhado até a quantidade,
    "Qtd: 2", colunas por tabulação (colado do Excel), CSV com ponto e vírgula, e editora no fim.
- **"Confira" também quando EMPATA** (`emDuvida`): "cola" casa igual com "Cola bastão" e "Cola
  branca", e escolher um pela papelaria seria adivinhar. A nota soma a semelhança com quanto de um
  nome cabe no outro, nos dois sentidos, porque a escola ora escreve mais que o catálogo, ora menos.
  A observação ("24 cores") entra na comparação.
- **Nada é gravado sem a conferência**, e a gravação é uma transação só (`importarItensDaLista`):
  linhas repetidas somam, produto que já estava fica com a quantidade da escola, e o que a
  papelaria não vende vai para o RECADO da lista num bloco "Itens da lista da escola que não
  vendemos:", que o cliente vê. Importar de novo troca o bloco em vez de repetir.

## Apontamentos de quem usa (23/10/2026, migração 0009)

Cinco pontos de uma papelaria de verdade, com o texto exato dela afirmado em
`test/listas-reais.test.ts` ("apontamentos de um usuário"):

- **Item dentro de item se divide**: "01 estojo com 02 lápis grafite Jumbo" são dois itens. O corte
  é " com " seguido de quantidade PEQUENA (1 a 5) e um objeto dos dois lados: "pasta com 20
  plásticos" continua um item só (20 plásticos são a pasta), e "estojo com 3 divisórias" também
  (divisória não é objeto que se compra).
- **Lista colada numa linha só** ("… e turma. - 01 pasta fichário …") se divide em " - " seguido de
  quantidade, MENOS depois de embalagem ("caixa", "kit", "pacote"): "1 caixa - 12 potes" é a
  caixa, não dois itens. Foi a lista do Jardim que mostrou isso.
- **A conferência edita o texto**: "Editar ou dividir" abre a linha da escola num campo, e "Ler de
  novo" passa pelo MESMO `lerLinhas` da importação: escrever duas linhas ali vira dois cartões.
  "Adicionar linha" é o mesmo campo, vazio. A sugestão de produto passou para o NAVEGADOR
  (`sugeridor`, com o catálogo preparado uma vez), senão cada edição seria uma ida ao servidor.
- **"A ou B" é escolha do CLIENTE** (decisão do Guilherme, 23/10/2026). "Lápis ou lapiseira" vira
  um cartão com um seletor por opção, e a opção que não traz o objeto herda a primeira palavra da
  outra ("pasta fichário ou catálogo" → "pasta catálogo"). No banco a alternativa é uma linha de
  `lista_item` com `alternativa_de` apontando para o principal da MESMA lista (chave composta), um
  nível só (gatilho). A vitrine entrega o principal com as alternativas dentro, e na revisão o
  cliente troca como troca a faixa. No painel, cada item tem "A escola aceita outro produto no
  lugar?" para pôr ou tirar alternativa à mão.
- **O desconto de lista completa trata o grupo como UM item**: qualquer produto do grupo, na
  quantidade da escola, completa. Mudou nas duas pontas (`app.descontos_aplicados` e
  `listaCompleta`), e `test/db/carrinho-paridade.test.ts` sorteia carrinhos COM alternativa
  escolhida. Sem isso, o cliente que obedece à escola e leva a lapiseira perderia o desconto.
- **Condição do item é exigência, não descrição**: "apontador com depósito PARA LÁPIS JUMBO" compara
  com o catálogo por "apontador com depósito" mais o que a exigência cobra ("jumbo"), e o cartão
  mostra "A escola pede: para lápis jumbo". Produto que não cumpre (`atendeExigencia`) fica em
  Confira.
- **`emDuvida` mede a distância em centésimos inteiros.** Em ponto flutuante `1 - 0.9` é
  `0.0999…`, e uma vitória clara de dez pontos ("Apontador com depósito jumbo" contra o sem jumbo)
  aparecia como empate. Achado no navegador, não em teste: o cartão dizia 100% e Confira.

## Legibilidade no computador (20/10/2026)

Medido em 16 telas × 7 larguras (1024 a 2560), antes de mexer. O celular estava certo e não mudou.

- **Letra: o tamanho do celular continua, e o computador ganha 1 px** (`lg:`): 12→13, 13→14,
  14→15, 15→16. Tela nova com texto pequeno leva o par: `text-[13px] lg:text-sm`. A menor letra
  no computador é 13 px.
- **O painel tem largura máxima de 1280 px** (`painel/layout.tsx`). Sem ela, em 2560 o conteúdo
  ia a 2.300 px e o nome do item ficava a mais de mil pixels do preço na mesma linha.
- **A JANELA decide a moldura; o CONTEÚDO decide o próprio arranjo** (20/10/2026). Ponto de quebra
  da janela (`lg:`) só para o que depende da tela: menu lateral, cabeçalho, coluna do resumo,
  tamanho de letra. Tudo que reparte uma linha entre texto e outra coisa (tabela, cartão de item,
  duas colunas dentro da página, link + botão) decide pela largura que TEM: `@container` e
  `@min-[…]:`. No painel o conteúdo é o contêiner `pagina` (`@min-[60rem]/pagina:`); na revisão do
  pedido, a própria lista; no Divulgar, o cartão.
  O motivo é o que aconteceu duas vezes seguidas: pela janela, o arranjo que servia com os nomes
  do catálogo de exemplo espremia "Bloco de desenho A4, 20 folhas" uma palavra por linha no catálogo
  de uma papelaria de verdade, e cada correção de ponto de quebra empurrava o defeito para outra
  largura (estreitar as colunas de preço salvou o nome e espremeu a marca).
- **O limiar sai do mínimo que o texto precisa**, não de um tamanho de tela: o cartão da revisão só
  fica numa linha com 54rem = nome com ~260 px + faixa 250 + quantidade 136 + preço 118 + vãos.
  Nome ao lado de etiqueta usa `flex-wrap` com o nome em `flex-[1_1_14rem]`: sem espaço, a
  etiqueta desce, em vez de o nome espremer.
- **`pnpm varredura`** (`scripts/varredura.mjs`) abre todas as telas redimensionando a janela de
  640 a 1920 px, de 32 em 32, e acusa texto espremido, cortado, linha de mais de 85 caracteres e
  rolagem lateral. **`ESTRESSE=1` alonga nomes, marcas e escolas até ~32 caracteres** antes de
  medir, porque o catálogo de exemplo tem nomes curtos e foi isso que escondeu o defeito. Mexeu em
  tela: rode os dois modos (precisa do `pnpm dev` no ar; o painel pede `VARREDURA_EMAIL` e
  `VARREDURA_SENHA`). Sai com código 1 se achar problema.
- **Parágrafo de explicação leva `leitura`** (`globals.css`, até ~72 caracteres por linha). Em
  `em`, não em `ch`: nesta fonte o "0" é largo e 68ch dava 95 caracteres.

## Capacidade (medida em 28/10/2026)

`docs/capacidade.md` tem o teste inteiro e `scripts/carga/` o repete. Em uma linha: o sistema não
cai por gente comprando junto (~22 compras/s no máximo do Neon gratuito, zero erros até 160
clientes simultâneos); **cai antes pelos limites do plano gratuito do Neon** (5 GB de
transferência ≈ 13 mil compras/mês, e 100 CU-hora ≈ 13 h acordado por dia), e o **painel** é o
que mais sofre com volume: a tela de pedidos não pagina, e catálogo, escolas e listas ficam
lentos conforme a PLATAFORMA cresce, porque faltam índices em `lista_item (produto_id)` e
`pedido (lista_id)`.

- **Medir por CPU e bytes por compra, não por vazão local**: é o que o Neon cobra e limita.
- **O gerador de volume só roda em Postgres local** e só apaga o banco `lista_pronta_carga`.
- **`pkill -f` com o padrão na própria linha mata o shell que o chamou** (saída 144). Para parar
  o servidor de teste, ache o pid (`ps -eo pid,args | grep "[n]ext-server"`) e use `kill`.

## Do protótipo, o que NÃO entra agora

O protótipo tem leitura de lista por foto e a fila "Itens não encontrados" que nasce dela.
**Foto continua fora**; PDF, Word, planilha e texto colado entraram em 19/10/2026 (acima). Também ficam fora: gateway real e split, envio de WhatsApp (o ponto de integração é
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
`20261005000000_ambiente.sql`. **Todas as migrações e o seed estão aplicados** (a 0009, das alternativas, em 25/10/2026, com os dez hashes conferidos).

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

**Na tela, quem compra é "cliente", nunca "pai" ou "pais"** (decisão do Guilherme, 19/10/2026).
Vale para todo texto que a papelaria ou o comprador leem: telas, mensagens, planilha. Nomes no
código (`comoPai`, "área do pai" nos comentários) ficam: não aparecem para ninguém.

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
