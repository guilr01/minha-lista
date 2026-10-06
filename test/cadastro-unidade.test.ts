import { describe, expect, it } from "vitest";
import { centavosDe, paraCampo } from "@/lib/dinheiro";
import { slugValido, sugerirSlug } from "@/lib/slug";

describe("centavosDe", () => {
  it.each([
    ["12,90", 1290], ["12.90", 1290], ["R$ 1.234,50", 123450], ["12", 1200],
    ["0,5", 50], [" 7,9 ", 790], ["1.234", null], ["", null], ["0", null], ["abc", null], ["1,234", null],
  ])("%s → %s", (entrada, esperado) => {
    expect(centavosDe(entrada)).toBe(esperado);
  });

  it("volta para o campo do jeito que se digita", () => {
    expect(paraCampo(1290)).toBe("12,90");
    expect(centavosDe(paraCampo(123450))).toBe(123450);
  });
});

describe("sugerirSlug", () => {
  it.each([
    ["Papelaria São João", "papelaria-sao-joao"],
    ["3º ano", "3-ano"],
    ["1ª série", "1-serie"],
    ["Colégio Modelo", "colegio-modelo"],
    ["  Escola --- Horizonte!! ", "escola-horizonte"],
  ])("%s → %s", (nome, slug) => {
    expect(sugerirSlug(nome)).toBe(slug);
  });

  it("valida o mesmo formato que o banco", () => {
    expect(slugValido("3-ano")).toBe(true);
    expect(slugValido("ab")).toBe(false);
    expect(slugValido("Com-Maiuscula")).toBe(false);
    expect(slugValido("fim-")).toBe(false);
  });
});
