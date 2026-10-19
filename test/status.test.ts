import { describe, expect, it } from "vitest";
import { mensagemDeStatus, proximoPasso } from "@/lib/status";

const base = { numero: 1042, aluno_nome: "Pedro Souza", responsavel_nome: "Ana Souza", papelaria: "Papelaria Central", acompanhamento: "https://x.test/pedido/abc" };

describe("aviso ao cliente pelo WhatsApp", () => {
  it("existe para cada passo que a papelaria pode dar, e leva o link de acompanhamento", () => {
    for (const status of ["pago", "em_separacao", "saiu_para_entrega", "pronto_para_retirada", "entregue"] as const) {
      const m = mensagemDeStatus({ ...base, status });
      expect(m, status).toContain("#1042");
      expect(m, status).toContain("Pedro Souza");
      expect(m, status).toContain("https://x.test/pedido/abc");
      expect(m, status).toMatch(/^Olá, Ana!/);
    }
  });

  it("todo status a que o botão do painel leva tem mensagem", () => {
    for (const s of ["pago", "em_separacao", "saiu_para_entrega", "pronto_para_retirada"] as const) {
      for (const mod of ["entrega", "retirada"] as const) {
        const prox = proximoPasso(s, mod);
        if (prox) expect(mensagemDeStatus({ ...base, status: prox.para }), prox.para).not.toBeNull();
      }
    }
  });

  it("não há aviso para pedido que não foi pago", () => {
    expect(mensagemDeStatus({ ...base, status: "aguardando_pagamento" })).toBeNull();
    expect(mensagemDeStatus({ ...base, status: "expirado" })).toBeNull();
  });
});
