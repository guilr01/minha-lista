import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador do modo de desenvolvimento fica, por padrão, no canto
  // inferior esquerdo, em cima do botão "Sair" da lateral do painel.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
