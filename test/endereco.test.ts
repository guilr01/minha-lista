import { describe, expect, it } from "vitest";
import { enderecoPublico } from "@/lib/endereco";

describe("endereço público dos links de e-mail", () => {
  it("em produção ignora o Host de quem pediu", () => {
    const vercel = { NODE_ENV: "production", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "minha-lista-self.vercel.app", VERCEL_URL: "minha-lista-abc.vercel.app" };
    expect(enderecoPublico("atacante.example", vercel)).toBe("https://minha-lista-self.vercel.app");
    expect(enderecoPublico("atacante.example", { ...vercel, URL_PUBLICA: "https://listapronta.com.br/" })).toBe("https://listapronta.com.br");
  });

  it("em prévia usa o endereço da própria publicação", () => {
    expect(enderecoPublico("x", { NODE_ENV: "production", VERCEL_ENV: "preview", VERCEL_URL: "minha-lista-abc.vercel.app" }))
      .toBe("https://minha-lista-abc.vercel.app");
  });

  it("produção fora da Vercel sem URL_PUBLICA recusa em vez de adivinhar", () => {
    expect(() => enderecoPublico("atacante.example", { NODE_ENV: "production" })).toThrow(/URL_PUBLICA/);
  });

  it("no desenvolvimento só aceita localhost", () => {
    expect(enderecoPublico("localhost:3001", { NODE_ENV: "development" })).toBe("http://localhost:3001");
    expect(enderecoPublico("atacante.example", { NODE_ENV: "development" })).toBe("http://localhost:3000");
  });
});
