import type { Faixa } from "@/lib/faixa";
import { ROTULO_FAIXA } from "@/lib/faixa";
import { Icone } from "./icone";

// Peças visuais do protótipo, traduzidas para classes. Valor de cor, raio e
// fonte vem do @theme de globals.css.

export const botao =
  "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-botao bg-azul px-5 text-base font-semibold text-white hover:bg-azul-escuro disabled:cursor-not-allowed disabled:bg-[#aeb7c2]";
export const botaoPequeno =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-azul px-4 text-[15px] font-semibold text-white hover:bg-azul-escuro disabled:cursor-not-allowed disabled:bg-[#aeb7c2]";
export const botaoContorno =
  "inline-flex min-h-[50px] items-center justify-center gap-2 rounded-botao border-[1.5px] border-azul bg-white px-5 text-base font-semibold text-azul hover:bg-azul-fundo hover:text-azul-escuro";
export const botaoContornoPequeno =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-azul bg-white px-4 text-[15px] font-semibold text-azul hover:bg-azul-fundo";
export const link = "font-semibold text-azul hover:text-azul-escuro hover:underline";
export const cartao = "rounded-cartao border border-linha bg-cartao";
export const campo =
  "h-[46px] w-full min-w-0 rounded-campo border border-campo bg-white px-3 text-[15px] text-tinta focus:border-azul focus:outline-2 focus:outline-offset-1 focus:outline-azul";
export const rotuloCampo = "flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold";

const COR_FAIXA: Record<Faixa | "mista", string> = {
  economica: "bg-azul-claro text-azul",
  intermediaria: "bg-azul text-white",
  premium: "bg-tinta text-amarelo",
  mista: "bg-linha-2 text-tinta",
};

export function ChipFaixa({ faixa }: { faixa: Faixa | "mista" }) {
  return (
    <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-bold ${COR_FAIXA[faixa]}`}>
      {faixa === "mista" ? "Mista" : ROTULO_FAIXA[faixa]}
    </span>
  );
}

const ETAPAS = ["Lista", "Faixa", "Revisão", "Pagamento"];

/** Os quatro passos, no alto da tela larga (o protótipo usa "Passo n de 4" no celular). */
export function Etapas({ atual }: { atual: number }) {
  return (
    <ol className="hidden items-center gap-2.5 lg:flex" aria-label="Etapas">
      {ETAPAS.map((t, i) => {
        const n = i + 1;
        const feita = n < atual;
        const agora = n === atual;
        return (
          <li key={t} className="flex items-center gap-2.5">
            {i > 0 && <span className="h-0.5 w-[70px] bg-linha" aria-hidden="true" />}
            <span className={`flex items-center gap-2 whitespace-nowrap text-sm font-semibold ${agora || feita ? "text-tinta" : "text-apagado"}`}
              aria-current={agora ? "step" : undefined}>
              <span className={`flex size-[26px] items-center justify-center rounded-full border-2 text-[13px] ${
                feita ? "border-ok bg-ok text-white" : agora ? "border-azul bg-azul text-white" : "border-campo bg-white"}`}>
                {feita ? <Icone nome="check" tamanho={13} traco={3.2} /> : n}
              </span>
              {t}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-botao bg-aviso-fundo px-4 py-3.5 text-sm leading-snug text-aviso">
      <Icone nome="alerta" tamanho={18} className="mt-px flex-none" />
      <div>{children}</div>
    </div>
  );
}

export function Informacao({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-[#b8c8dd] bg-azul-fundo px-3.5 py-3 text-[13px] leading-snug text-[#2b3c52]">
      {children}
    </div>
  );
}
