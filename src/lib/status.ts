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

/**
 * A mensagem para avisar o responsável de que o pedido andou. A plataforma
 * NÃO envia WhatsApp (fora do escopo, sem API de negócio): o botão do painel
 * abre o WhatsApp da papelaria com este texto escrito, e quem envia é ela.
 * Vai sempre o link de acompanhamento, que mostra o status ao vivo.
 */
export function mensagemDeStatus(p: {
  status: StatusPedido;
  numero: number;
  aluno_nome: string;
  responsavel_nome: string;
  papelaria: string;
  acompanhamento: string;
}): string | null {
  const ola = `Olá, ${p.responsavel_nome.split(" ")[0]}! Aqui é da ${p.papelaria}.`;
  const kit = `o material de ${p.aluno_nome} (pedido #${p.numero})`;
  const corpo: Partial<Record<StatusPedido, string>> = {
    pago: `Recebemos o pagamento e ${kit} já está na fila de separação.`,
    em_separacao: `Começamos a separar ${kit}.`,
    saiu_para_entrega: `${kit[0].toUpperCase()}${kit.slice(1)} saiu para entrega e chega em breve.`,
    pronto_para_retirada: `${kit[0].toUpperCase()}${kit.slice(1)} está pronto para retirada na loja.`,
    entregue: `${kit[0].toUpperCase()}${kit.slice(1)} foi entregue. Obrigado pela compra!`,
  };
  const t = corpo[p.status];
  if (!t) return null;
  return `${ola} ${t}\n\nAcompanhe o pedido: ${p.acompanhamento}`;
}
