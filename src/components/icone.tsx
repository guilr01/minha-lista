// Os ícones do protótipo (traço, 24×24). Cor vem de currentColor.
const CAMINHOS = {
  check: <path d="M20 6 9 17l-5-5" />,
  voltar: <path d="m15 18-6-6 6-6" />,
  escola: (<><path d="m3 10 9-5 9 5-9 5Z" /><path d="M7 12.3V17c3 2.2 7 2.2 10 0v-4.7" /></>),
  mais: <path d="M12 5v14M5 12h14" />,
  alerta: (<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></>),
  caminhao: (<><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>),
  copiar: (<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>),
  lista: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  caixa: (<><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></>),
  loja: (<><path d="M4 9h16l-1-5H5Z" /><path d="M5 9v11h14V9" /><path d="M10 20v-6h4v6" /></>),
  cartao: (<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>),
  pix: (<><path d="M12 3 21 12 12 21 3 12Z" /><path d="m8 12 4-4 4 4-4 4Z" /></>),
  conversa: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5A8 8 0 1 1 21 12Z" />,
  seta: <path d="m9 18 6-6-6-6" />,
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export function Icone({ nome, tamanho = 20, traco = 2, className }: { nome: NomeIcone; tamanho?: number; traco?: number; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={traco} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {CAMINHOS[nome]}
    </svg>
  );
}
