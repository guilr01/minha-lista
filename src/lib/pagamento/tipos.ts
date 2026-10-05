// A fronteira com o gateway de pagamento. O resto do sistema só conhece esta
// interface; trocar o falso por Mercado Pago, Asaas ou Pagar.me é escrever
// uma implementação nova e escolhê-la em PAGAMENTO_PROVEDOR.

export type MetodoPagamento = "pix" | "cartao";
export type StatusPagamento = "pendente" | "aprovado" | "recusado" | "expirado" | "estornado";

export interface NovaCobranca {
  /** Identifica o pedido no painel do gateway. Não é o token do pai. */
  referencia: string;
  descricao: string;
  valorCentavos: number;
  metodo: MetodoPagamento;
  parcelas: number;
  pagador: { nome: string; whatsapp: string };
  /** Conta da papelaria no gateway, para o split. O falso ignora. */
  recebedor?: string;
  /** Para onde o gateway devolve o pai depois do cartão. */
  urlRetorno: string;
}

export interface Cobranca {
  idExterno: string;
  status: StatusPagamento;
  pix?: { copiaECola: string; expiraEm: string };
  /**
   * Cartão: página do PRÓPRIO gateway. O número do cartão nunca passa pelo
   * nosso servidor, e é isso que nos tira do escopo do PCI.
   */
  urlCartao?: string;
}

export interface EventoDePagamento {
  idExterno: string;
  status: StatusPagamento;
}

export interface PaymentProvider {
  readonly nome: string;
  criarCobranca(c: NovaCobranca): Promise<Cobranca>;
  consultar(idExterno: string): Promise<StatusPagamento>;
  /** Valida a assinatura e traduz o aviso do gateway. Nulo: ignorar. */
  interpretarWebhook(req: Request): Promise<EventoDePagamento | null>;
}
