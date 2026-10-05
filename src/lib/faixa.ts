// As três faixas de preço, na ordem que importa: da mais barata para a mais cara.
export const FAIXAS = ["economica", "intermediaria", "premium"] as const;
export type Faixa = (typeof FAIXAS)[number];

export const ROTULO_FAIXA: Record<Faixa, string> = {
  economica: "Econômica",
  intermediaria: "Intermediária",
  premium: "Premium",
};

export const DESCRICAO_FAIXA: Record<Faixa, string> = {
  economica: "Marcas básicas, melhor preço.",
  intermediaria: "Marcas conhecidas, mais durabilidade.",
  premium: "Marcas top de linha.",
};

/**
 * Qual opção vale quando o pai escolhe uma faixa que o item pode não ter.
 *
 * Vale a mais próxima ABAIXO (não cobra mais do que o pai escolheu); sem
 * nenhuma abaixo, a mais próxima acima. Recebe só as opções DISPONÍVEIS.
 *
 * Esta é a cópia da tela: a regra que vale no pedido é
 * `app.opcao_resolvida`, no banco. test/db/faixa-paridade.test.ts compara as
 * duas em todas as combinações; mudar uma sem a outra quebra o teste.
 */
export function opcaoResolvida<T extends { faixa: Faixa }>(opcoes: readonly T[], pedida: Faixa): T | null {
  const alvo = FAIXAS.indexOf(pedida);
  let melhor: T | null = null;
  let melhorChave = Infinity;
  for (const o of opcoes) {
    const i = FAIXAS.indexOf(o.faixa);
    const chave = i <= alvo ? alvo - i : 10 + (i - alvo);
    if (chave < melhorChave) {
      melhor = o;
      melhorChave = chave;
    }
  }
  return melhor;
}
