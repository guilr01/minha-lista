import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador do modo de desenvolvimento fica, por padrão, no canto
  // inferior esquerdo, em cima do botão "Sair" da lateral do painel.
  devIndicators: { position: "bottom-right" },
  // O leitor de listas recebe foto e PDF por Server Action, cujo limite padrão
  // é 1 MB. 4 MB de arquivo (src/lib/leitor/entrada.ts) mais a moldura do
  // multipart, abaixo dos 4,5 MB que a Vercel aceita por requisição.
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // Navegadores pedem /favicon.ico por conta própria. Sem isto o pedido cai
  // na rota /[papelaria] e vira uma consulta ao banco por um ícone.
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
};

export default nextConfig;
