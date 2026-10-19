// As séries que toda escola tem, para a papelaria escolher numa lista em vez
// de digitar uma a uma. A posição aqui vira a ordem da série na vitrine: o
// cliente vê 1º ano antes de 2º, e o Ensino Médio depois do 9º ano.

export const SERIES_PADRAO: { grupo: string; nomes: string[] }[] = [
  { grupo: "Ensino Fundamental", nomes: Array.from({ length: 9 }, (_, i) => `${i + 1}º ano`) },
  { grupo: "Ensino Médio", nomes: [1, 2, 3].map((n) => `${n}ª série do Ensino Médio`) },
];

const ORDEM = new Map(SERIES_PADRAO.flatMap((g) => g.nomes).map((n, i) => [n, i]));

/** Posição da série padrão (0 = 1º ano); null para série digitada à mão. */
export function ordemPadrao(nome: string): number | null {
  return ORDEM.get(nome.trim()) ?? null;
}
