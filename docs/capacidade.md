# Capacidade: até onde o sistema aguenta (medido em 28/10/2026)

Medido com o código de produção de 26/10/2026 (commit `ccd213d`), num banco local com volume de
safra, e convertido para os planos que estão em uso: **Neon gratuito (`free_v3`)** e Vercel.
Os scripts estão em `scripts/carga/` e repetem tudo em uns 15 minutos (ver "Como repetir").

## Resposta curta

Com o que está no ar hoje, o sistema **não cai por excesso de gente comprando**. Ele esbarra
antes em três coisas, nesta ordem:

| # | Teto | Onde fica | O que acontece |
|---|---|---|---|
| 1 | **Transferência do banco (Neon gratuito: 5 GB/mês)** | ~13 mil compras por mês na plataforma inteira (~4 mil se as papelarias tiverem catálogo de 600 produtos) | O Neon **suspende o banco até o mês seguinte**: loja e painel fora do ar |
| 2 | **Horas de computação (Neon gratuito: 100 CU-hora/mês)** | ~400 horas acordado no tamanho mínimo, ou seja, ~13 h por dia em média | Mesma suspensão. Na safra, com acesso o dia todo, acaba por volta do dia 16 |
| 3 | **Tela de pedidos do painel** | ~1.000 a 2.000 pedidos numa papelaria | A página traz TODOS os pedidos, inclusive os entregues: 450 pedidos = 0,4 s e 2,4 MB; 27 mil = 31 s e 144 MB |

Depois deles, ainda no plano gratuito:

| Teto | Onde fica |
|---|---|
| Armazenamento (1 GB) | ~95 mil pedidos acumulados (com 50 papelarias cadastradas); depois disso o banco recusa gravação |
| Vazão de compras (Neon no máximo, 2 CU) | ~22 compras completas por segundo (~79 mil por hora) em papelarias de 150 produtos; ~10 por segundo (~37 mil por hora) com catálogo de 600 |
| Gente comprando ao mesmo tempo | ~6.600 pais no meio de uma compra (supondo 5 minutos por compra); ~1.100 antes de o Neon aumentar a máquina |

E as telas de catálogo, escolas, lista e importação do painel **ficam mais lentas conforme a
PLATAFORMA cresce, não só a papelaria**: com 300 papelarias e 180 mil pedidos no banco, uma
papelaria pequena espera 1,6 a 2 s, e uma grande 8 a 15 s. Faltam dois índices (abaixo).

## Como foi medido

**Volume** (`scripts/carga/gerar-volume.mjs`): 300 papelarias, das quais uma "gigante". Total:
180 mil pedidos, 5,4 milhões de itens de pedido e banco de 2 GB.

| | Papelaria comum | Gigante |
|---|---|---|
| Produtos (3 faixas cada) | 150 | 600 |
| Listas (30 itens cada) | 60 | 600 |
| Pedidos | 500 | 30 mil |

**Máquina**: Postgres 16 local **preso em 2 núcleos** (Xeon 2,1 GHz), que é o máximo do Neon
gratuito (2 CU = 2 vCPU). O app rodou em `next start`, duas instâncias, nos outros 2 núcleos.
O Neon roda em ARM da AWS: a conversão de CPU vale como ordem de grandeza (±30%).

**O que se mede é CPU e bytes por compra, não vazão local**: vazão depende da máquina, mas o
Neon cobra e limita por CPU (CU-hora) e por bytes (transferência).

## Medidas

### Consumo de uma compra completa

Uma compra completa é o caminho inteiro: lista, revisão, dados, compra pela Server Action
real e página do pedido.

| | Papelaria comum | Gigante |
|---|---|---|
| CPU do banco | 68 ms | 147 ms |
| CPU do app (Node) | 74 ms | 132 ms |
| Bytes que saem do banco (contam nos 5 GB) | 376 KB | 1,19 MB |
| HTML enviado ao navegador (sem compressão) | 521 KB | 1,31 MB |
| Chamadas de função na Vercel | 5 | 5 |

**Para onde vai o tempo do banco** numa compra (`pg_stat_statements`, 20 clientes por 30 s):

| Consulta | % do tempo | Vezes por compra | Bytes por chamada |
|---|---|---|---|
| `vitrine_catalogo` (catálogo inteiro, para "Adicionar um item") | 46% | **3** | 82 KB (328 KB na gigante) |
| `vitrine_lista` | 29% | **6** | 19 KB |
| `criar_pedido` | 13% | 1 | pequeno |
| `vitrine_papelaria` | 6% | 3 | 3 KB (28 KB na gigante) |

Dois desperdícios em `src/app/[papelaria]/[escola]/[serie]/page.tsx`:

- **`buscarLista` não usa `cache()`**, ao contrário de `buscarPapelaria`. Por isso a lista é
  buscada duas vezes por página: uma no `generateMetadata` e outra no corpo.
- **O catálogo inteiro vem nas três etapas**, e só a revisão o usa.

### Carga: clientes comprando ao mesmo tempo

Clientes virtuais sem pausa entre os passos, de 5 a 160 ao mesmo tempo
(`scripts/carga/carga-http.mjs`), com zero erros em todos os degraus.

Com as papelarias sorteadas, a vazão para em **~21 compras por segundo** a partir de 10 clientes.
Daí em diante a espera cresce em linha reta, e a compra leva:

| Clientes ao mesmo tempo | Mediana | 5% mais lentos |
|---|---|---|
| 10 | 0,1 s | 0,2 s |
| 40 | 0,6 s | 1,0 s |
| 160 | 1,8 s | 3,3 s |

Nesse cenário o limite local foi o app, com o banco em 70%. Na Vercel o app se multiplica; o
banco não.

Com todos na papelaria gigante, a vazão fica em **~11 compras por segundo**, já com o banco
em 80%. Com 160 clientes a compra leva 3,6 s na mediana e 6,6 s nos 5% mais lentos. A trava que
numera os pedidos (`for update` em `fornecedor`) **não** virou fila: o limite foi CPU.

### Painel, uma pessoa por vez

A coluna "com índices" é um experimento feito só no banco de carga local, nada aplicado em
produção:

| Tela | Gigante | Gigante com índices | Comum | Comum com índices |
|---|---|---|---|---|
| Pedidos (`/painel`) | 31 s · 144 MB | 31 s | 0,4 s · 2,4 MB | 0,4 s |
| Catálogo | 8,0 s | **0,8 s** | 1,8 s | **0,15 s** |
| Escolas | 15,6 s | **1,0 s** | 1,6 s | **0,09 s** |
| Lista | 8,0 s | **0,8 s** | 2,0 s | **0,17 s** |
| Importar lista | 7,9 s | **0,5 s** | 1,9 s | **0,08 s** |
| Um pedido, loja, um produto | < 50 ms | | < 50 ms | |

As causas, lidas no plano das consultas (`auto_explain`):

- **Catálogo, lista e importação**: "em quantas listas está este produto" conta em `lista_item`
  por `produto_id`, e não há índice que comece por essa coluna. O banco percorre o índice de
  listas de TODAS as papelarias, uma vez por produto.
- **Escolas**: "quantos pedidos esta lista teve" conta em `pedido` por `lista_id`, sem índice.
  Leitura da tabela inteira de pedidos da plataforma (179.500 linhas) uma vez por lista.
- **Pedidos**: sem paginação, agrega 765 mil linhas (25.500 pedidos × 30 itens) e desenha 25.500
  linhas. Dos 19 s da consulta, ~16 são a regra de segurança: as policies chamam
  `app.eh_membro(fornecedor_id)` uma vez POR LINHA (795 mil chamadas, ~20 µs cada).

Cada pedido acrescenta ~5,3 KB e ~1,1 ms à tela de pedidos, e ela nunca encolhe, porque os
entregues continuam nela.

### Armazenamento

**10,2 KB por pedido de 30 itens**, contando itens, histórico e pagamento, medido nos 180 mil.
Uma papelaria comum cadastrada (150 produtos, 60 listas) ocupa ~0,67 MB.

## Projeção para produção

| Recurso | Limite do plano | Consumo medido | Teto |
|---|---|---|---|
| Neon: transferência | 5 GB/mês (gratuito) · 500 GB (Launch) | 376 KB por compra | ~13 mil compras/mês · ~1,3 milhão no Launch |
| Neon: computação | 100 CU-h/mês (gratuito) | o banco fica acordado enquanto houver acesso nos últimos 5 min | ~400 h acordado no tamanho mínimo (0,25 CU) |
| Neon: CPU | 2 vCPU no máximo (gratuito) | 68 ms por compra | ~22 compras/s com folga de 25% |
| Neon: armazenamento | 1 GB (gratuito) | 10,2 KB por pedido | ~95 mil pedidos |
| Neon: conexões | 10 mil no pooler, 901 no banco a 2 CU | 5 por instância do app | não é o limite |

A computação do Neon é cobrada pelo tamanho da máquina × horas acordada, não pelo trabalho
feito: 13 mil compras gastam ~15 minutos de CPU. O que consome as 100 horas é **ficar acordado**,
e qualquer acesso a cada 5 minutos (inclusive robôs de busca) mantém acordado.

**A Vercel não foi conferida.** A página de limites dela não abre desta sessão. O consumo por
compra está na tabela acima para comparar com a aba Usage do painel da Vercel. Atenção: pelo que
conheço das regras da Vercel, o plano gratuito (Hobby) é para uso pessoal, não comercial.
Confirmar antes de vender.

## O que sobe o teto, do maior ganho pelo menor esforço

1. **Neon pago (Launch) antes de vender.** Tira a suspensão por transferência (5 → 500 GB) e por
   horas de computação. A computação custa ~US$ 0,106 por CU-hora: acordado o mês inteiro no
   tamanho mínimo dá ~182 CU-h, ~US$ 19, mais armazenamento.
2. **Dois índices** (uma migração pequena): `lista_item (produto_id)` e `pedido (lista_id)`.
   Painel 10 a 20 vezes mais rápido, e a papelaria pequena deixa de pagar pelo volume das outras.
3. **Paginar a tela de pedidos**, com os ativos de saída e os entregues sob demanda. Ela passa a
   custar o mesmo com 500 ou 50 mil pedidos.
4. **Página do cliente:** `cache()` em `buscarLista` e catálogo só na revisão, ou só quando a
   pessoa abre "Adicionar um item". Na conta, menos ~45% de CPU do banco e ~60% de transferência
   por compra (376 → ~155 KB, e ~73 KB se o catálogo vier só sob demanda): o teto do item 1 no
   plano gratuito iria de ~13 mil para ~32 mil a ~68 mil compras/mês.
5. **Regra de segurança sem função por linha.** Trocar `(select app.eh_membro(fornecedor_id))`
   por uma comparação com o conjunto de papelarias da pessoa, calculado uma vez por consulta.
   É o maior ganho nas telas grandes do painel, e mexe na trava de isolamento entre papelarias:
   precisa dos testes de isolamento conferidos por mutação.

## Como repetir

```
pg_ctlcluster 16 main start
node scripts/carga/gerar-volume.mjs                      # ~4 min, banco lista_pronta_carga
DATABASE_URL=<…/lista_pronta_carga> pnpm build
DATABASE_URL=<…/lista_pronta_carga> URL_PUBLICA=http://localhost:3010 pnpm start -p 3010
node scripts/carga/medir-telas.mjs                       # cada tela, uma pessoa por vez
CARGA_URLS=http://localhost:3010 node scripts/carga/carga-http.mjs   # degraus de concorrência
ALVO=gigante node scripts/carga/carga-http.mjs           # todos na mesma papelaria
```

- **Para o ranking de consultas**, o Postgres local precisa de
  `shared_preload_libraries = 'pg_stat_statements, auto_explain'`, e o banco de
  `create extension pg_stat_statements`.
- **Para valer como o Neon gratuito**, prenda o Postgres em 2 núcleos:
  `taskset -a -cp 0,1 <pid do postmaster>`.
- **Sem `URL_PUBLICA`, a página de um pedido no painel responde 500.** Isso é a trava de
  `src/lib/endereco.ts`, não defeito.
- **O gerador só aceita um Postgres local e só apaga o banco `lista_pronta_carga`.**
