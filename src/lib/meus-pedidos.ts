// "Meus pedidos" do pai, que não tem conta: os pedidos feitos NESTE aparelho,
// guardados no navegador. O que vale é o link com o token; isto é só atalho.

export type PedidoGuardado = {
  token: string;
  numero: number;
  papelaria: string;
  slug: string;
  aluno: string;
  lista: string;
  total_centavos: number;
  criado_em: string;
};

const CHAVE = "lp:meus-pedidos";

export function lerPedidos(): PedidoGuardado[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(v) ? v.filter((p) => typeof p?.token === "string" && /^[0-9a-f]{64}$/.test(p.token)) : [];
  } catch {
    return [];
  }
}

export function guardarPedido(p: PedidoGuardado) {
  try {
    const outros = lerPedidos().filter((x) => x.token !== p.token);
    localStorage.setItem(CHAVE, JSON.stringify([p, ...outros].slice(0, 30)));
  } catch {
    // sem armazenamento: o pedido continua acessível pelo link
  }
}
