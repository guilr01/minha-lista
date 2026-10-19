import { z } from "zod";

// O que o leitor devolve. É o contrato com quem consome a lista: a Lista Pronta
// hoje, o agregador de afiliados depois. Por isso esta pasta não importa nada
// do resto do aplicativo (test/leitor-isolado.test.ts afirma isso).

export const ItemLidoSchema = z.object({
  /** O trecho da lista como estava escrito, para a pessoa conferir. */
  texto_original: z.string(),
  /** Nome padronizado do produto, sem quantidade nem especificação. */
  nome: z.string(),
  quantidade: z.number().int(),
  /** Especificações curtas: "10 matérias", "HB", "caixa com 12", "capa dura". */
  especificacoes: z.array(z.string()),
  /** Algo que a lista pede e não é especificação ("etiquetar com o nome"). */
  observacao: z.string().nullable(),
});

export const ListaLidaSchema = z.object({
  /** Verdadeiro quando o conteúdo não é uma lista de produtos. */
  nao_e_lista: z.boolean(),
  itens: z.array(ItemLidoSchema),
  /** Trechos que parecem item mas não deu para ler com segurança. */
  ilegiveis: z.array(z.string()),
});

export type ItemLido = z.infer<typeof ItemLidoSchema>;
export type ListaLida = z.infer<typeof ListaLidaSchema>;

/** De onde vem a lista. O arquivo chega em base64, já conferido por `validarEntrada`. */
export type EntradaDoLeitor =
  | { tipo: "texto"; texto: string }
  | { tipo: "imagem"; mime: TipoDeImagem; base64: string }
  | { tipo: "pdf"; base64: string };

export const TIPOS_DE_IMAGEM = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type TipoDeImagem = (typeof TIPOS_DE_IMAGEM)[number];
