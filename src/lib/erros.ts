// O banco levanta erros com um código estável no começo da mensagem
// ("preco_mudou: ..."). Aqui está o texto que o pai lê para cada um.

const MENSAGENS: Record<string, string> = {
  lista_indisponivel: "Esta lista não está mais disponível. Fale com a papelaria.",
  item_indisponivel: "Um dos itens ficou indisponível. Recarregue a página e revise a lista.",
  preco_mudou: "Os preços foram atualizados pela papelaria. Confira o novo total antes de pagar.",
  pedido_vazio: "Seu pedido está vazio. Mantenha pelo menos um item.",
  dados_invalidos: "Confira os dados do aluno, do responsável e da entrega.",
  entrega_indisponivel: "Esta papelaria não faz entrega. Escolha retirar na loja.",
  retirada_indisponivel: "Esta papelaria não faz retirada. Escolha a entrega.",
  entrada_invalida: "Não foi possível montar o pedido. Recarregue a página e tente de novo.",
};

export type ErroDePedido = { codigo: string; mensagem: string; detalhe?: string };

export function traduzirErro(e: unknown): ErroDePedido | null {
  const msg = e instanceof Error ? e.message : "";
  const m = /^([a-z_]+): ?([\s\S]*)$/.exec(msg) ?? /^([a-z_]+)$/.exec(msg);
  if (!m || !MENSAGENS[m[1]]) return null;
  return { codigo: m[1], mensagem: MENSAGENS[m[1]], detalhe: m[2] };
}
