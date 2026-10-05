import { describe, expect, it } from "vitest";
import { reais } from "@/lib/dinheiro";
import { opcaoResolvida } from "@/lib/faixa";

describe("reais", () => {
  it("formata centavos em reais, com milhar e vírgula", () => {
    expect(reais(0)).toBe("R$ 0,00");
    expect(reais(790)).toBe("R$ 7,90");
    expect(reais(123456)).toBe("R$ 1.234,56");
  });
});

describe("opcaoResolvida", () => {
  it("prefere a faixa pedida, depois a de baixo, depois a de cima", () => {
    const e = { faixa: "economica" as const };
    const i = { faixa: "intermediaria" as const };
    const p = { faixa: "premium" as const };
    expect(opcaoResolvida([e, i, p], "intermediaria")).toBe(i);
    expect(opcaoResolvida([e, p], "intermediaria")).toBe(e);
    expect(opcaoResolvida([p], "economica")).toBe(p);
    expect(opcaoResolvida([e, i], "premium")).toBe(i);
    expect(opcaoResolvida([], "premium")).toBeNull();
  });
});
