import type { Faixa } from "./faixa";

// O formato que as funções da área pública devolvem (db/migrations/0003).
// Tipos à mão: mudar uma função lá exige mudar aqui.

export type Opcao = {
  id: string;
  faixa: Faixa;
  marca: string;
  descricao: string | null;
  preco_centavos: number;
};

export type Papelaria = {
  nome: string;
  slug: string;
  whatsapp: string | null;
  logo_path: string | null;
  endereco_retirada: string | null;
  aceita_entrega: boolean;
  aceita_retirada: boolean;
  taxa_entrega_centavos: number;
  parcelas_maximas: number;
};

export type VitrinePapelaria = {
  papelaria: Papelaria;
  escolas: { nome: string; slug: string; cidade: string | null; series: { nome: string; slug: string }[] }[];
};

export type ItemDaLista = {
  produto_id: string;
  nome: string;
  categoria: string | null;
  unidade: string;
  quantidade: number;
  observacao: string | null;
  opcoes: Opcao[];
};

export type VitrineLista = {
  papelaria: Papelaria;
  escola: { nome: string; slug: string };
  serie: { nome: string; slug: string };
  lista: { id: string; ano_letivo: number; observacoes: string | null };
  itens: ItemDaLista[];
};

export type ProdutoDoCatalogo = {
  produto_id: string;
  nome: string;
  categoria: string | null;
  unidade: string;
  opcoes: Opcao[];
};

export type StatusPedido =
  | "aguardando_pagamento"
  | "pago"
  | "em_separacao"
  | "saiu_para_entrega"
  | "pronto_para_retirada"
  | "entregue"
  | "cancelado"
  | "expirado";

export type PedidoPublico = {
  numero: number;
  status: StatusPedido;
  papelaria: Papelaria;
  escola_nome: string;
  serie_nome: string;
  ano_letivo: number;
  faixa_base: Faixa;
  aluno_nome: string;
  responsavel_nome: string;
  modalidade: "entrega" | "retirada";
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
  } | null;
  metodo_pagamento: "pix" | "cartao";
  parcelas: number;
  subtotal_centavos: number;
  taxa_entrega_centavos: number;
  total_centavos: number;
  criado_em: string;
  expira_em: string | null;
  pago_em: string | null;
  itens: {
    nome: string;
    marca: string;
    faixa: Faixa;
    faixa_pedida: Faixa;
    preco_unitario_centavos: number;
    quantidade: number;
    origem: "lista" | "adicionado";
  }[];
  eventos: { status: StatusPedido; em: string }[];
  pagamento: {
    metodo: "pix" | "cartao";
    status: string;
    parcelas: number;
    dados: { copiaECola?: string; expiraEm?: string; urlCartao?: string };
  } | null;
};
