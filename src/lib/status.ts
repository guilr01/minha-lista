import type { StatusPedido } from "./vitrine";

// Como cada status se chama e que cor tem. Uma definição só: a página do pai
// e o painel da papelaria dizem a mesma coisa sobre o mesmo pedido.

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Aguardando pagamento",
  pago: "Pago · a separar",
  em_separacao: "Em separação",
  saiu_para_entrega: "Saiu para entrega",
  pronto_para_retirada: "Pronto para retirada",
  entregue: "Entregue",
  cancelado: "Cancelado",
  expirado: "Pagamento expirado",
};

export const COR_STATUS: Record<StatusPedido, string> = {
  aguardando_pagamento: "bg-aviso-fundo text-aviso",
  pago: "bg-azul-claro text-azul",
  em_separacao: "bg-aviso-fundo text-aviso",
  saiu_para_entrega: "bg-roxo-fundo text-roxo",
  pronto_para_retirada: "bg-roxo-fundo text-roxo",
  entregue: "bg-ok-fundo text-ok",
  cancelado: "bg-linha-2 text-tinta",
  expirado: "bg-linha-2 text-tinta",
};

/** O próximo passo de um pedido, e o texto do botão que o dá. */
export function proximoPasso(status: StatusPedido, modalidade: "entrega" | "retirada"): { para: StatusPedido; rotulo: string } | null {
  switch (status) {
    case "pago":
      return { para: "em_separacao", rotulo: "Iniciar separação" };
    case "em_separacao":
      return modalidade === "retirada"
        ? { para: "pronto_para_retirada", rotulo: "Marcar pronto para retirada" }
        : { para: "saiu_para_entrega", rotulo: "Marcar como saiu para entrega" };
    case "saiu_para_entrega":
      return { para: "entregue", rotulo: "Confirmar entrega" };
    case "pronto_para_retirada":
      return { para: "entregue", rotulo: "Confirmar retirada" };
    default:
      return null;
  }
}

/** "há 5 min", "há 3 h", "há 2 dias" */
export function haQuanto(iso: string, agora = Date.now()): string {
  const m = Math.round((agora - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d > 1 ? "dias" : "dia"}`;
}
