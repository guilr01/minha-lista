import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador do modo de desenvolvimento fica, por padrão, no canto
  // inferior esquerdo, em cima do botão "Sair" da lateral do painel.
  devIndicators: { position: "bottom-right" },
  // A planilha do catálogo sobe por Server Action; o padrão de 1 MB é pouco.
  // 4 MB fica abaixo do teto de 4,5 MB do corpo de requisição na Vercel.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  // Navegadores pedem /favicon.ico por conta própria. Sem isto o pedido cai
  // na rota /[papelaria] e vira uma consulta ao banco por um ícone.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
};

export default nextConfig;
