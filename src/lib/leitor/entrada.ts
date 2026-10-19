import { TIPOS_DE_IMAGEM, type TipoDeImagem } from "./tipos";

// O que o leitor aceita, conferido ANTES de gastar uma chamada ao modelo.
//
// 4 MB por arquivo porque a Vercel recusa corpo de requisição acima de 4,5 MB,
// e o limite da Server Action (next.config.ts) acompanha esse número. Foto de
// celular passa disso com frequência: reduzir no navegador antes de enviar é a
// pendência registrada no CLAUDE.md.

export const TAMANHO_MAXIMO_BYTES = 4 * 1024 * 1024;
export const TEXTO_MAXIMO_CARACTERES = 20_000;

export type ArquivoRecebido = { tipo: string; tamanho: number };

export type ResultadoDaValidacao =
  | { ok: true; forma: "texto" }
  | { ok: true; forma: "imagem"; mime: TipoDeImagem }
  | { ok: true; forma: "pdf" }
  | { ok: false; erro: "vazio" | "dois_ao_mesmo_tempo" | "tipo_nao_aceito" | "arquivo_grande" | "texto_grande" };

export function validarEntrada({ arquivo, texto }: { arquivo?: ArquivoRecebido | null; texto?: string | null }): ResultadoDaValidacao {
  const temArquivo = !!arquivo && arquivo.tamanho > 0;
  const temTexto = !!texto && texto.trim().length > 0;
  if (!temArquivo && !temTexto) return { ok: false, erro: "vazio" };
  // Os dois juntos seria adivinhar qual a pessoa quis ler.
  if (temArquivo && temTexto) return { ok: false, erro: "dois_ao_mesmo_tempo" };

  if (temTexto) {
    if (texto!.length > TEXTO_MAXIMO_CARACTERES) return { ok: false, erro: "texto_grande" };
    return { ok: true, forma: "texto" };
  }

  if (arquivo!.tamanho > TAMANHO_MAXIMO_BYTES) return { ok: false, erro: "arquivo_grande" };
  if (arquivo!.tipo === "application/pdf") return { ok: true, forma: "pdf" };
  const imagem = TIPOS_DE_IMAGEM.find((t) => t === arquivo!.tipo);
  if (imagem) return { ok: true, forma: "imagem", mime: imagem };
  return { ok: false, erro: "tipo_nao_aceito" };
}
