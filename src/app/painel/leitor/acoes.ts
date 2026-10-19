"use server";

import { lerLista, type ErroDoLeitor } from "@/lib/leitor/extrair";
import { validarEntrada, type ResultadoDaValidacao } from "@/lib/leitor/entrada";
import type { EntradaDoLeitor, ListaLida } from "@/lib/leitor/tipos";
import { exigirUsuario } from "@/lib/sessao";

// Protótipo do leitor de listas. NADA é gravado: a ação lê e devolve. Qualquer
// papelaria pode se cadastrar pela página inicial, e cada leitura é uma
// chamada paga ao modelo; por isso, em produção, só com LEITOR_LIBERADO=1.

export type EstadoDoLeitor = { erro?: string; lista?: ListaLida; origem?: string };

export async function leitorLiberado(): Promise<boolean> {
  return process.env.NODE_ENV !== "production" || process.env.LEITOR_LIBERADO === "1";
}

const MENSAGENS: Record<Exclude<ResultadoDaValidacao, { ok: true }>["erro"] | ErroDoLeitor, string> = {
  vazio: "Envie uma foto ou um PDF, ou cole o texto da lista.",
  dois_ao_mesmo_tempo: "Envie o arquivo OU cole o texto, um de cada vez.",
  tipo_nao_aceito: "Aceitamos foto (JPG, PNG, WEBP ou GIF) e PDF.",
  arquivo_grande: "O arquivo passa de 4 MB. Tire a foto com resolução menor ou envie um PDF mais leve.",
  texto_grande: "O texto passa de 20 mil caracteres. Cole uma lista por vez.",
  sem_chave: "O leitor não está configurado neste ambiente (falta ANTHROPIC_API_KEY).",
  recusado: "O modelo não leu este conteúdo. Confira se é mesmo uma lista de produtos.",
  resposta_invalida: "A leitura não veio completa. Tente de novo.",
  muitas_chamadas: "Muitas leituras seguidas. Espere um minuto e tente de novo.",
  indisponivel: "O serviço de leitura não respondeu. Tente de novo em instantes.",
};

export async function lerListaAcao(_: EstadoDoLeitor, f: FormData): Promise<EstadoDoLeitor> {
  await exigirUsuario();
  if (!(await leitorLiberado())) return { erro: "O leitor de listas não está liberado neste ambiente." };

  const bruto = f.get("arquivo");
  const arquivo = bruto instanceof File && bruto.size > 0 ? bruto : null;
  const texto = String(f.get("texto") ?? "");

  const v = validarEntrada({ arquivo: arquivo && { tipo: arquivo.type, tamanho: arquivo.size }, texto });
  if (!v.ok) return { erro: MENSAGENS[v.erro] };

  let entrada: EntradaDoLeitor;
  if (v.forma === "texto") entrada = { tipo: "texto", texto: texto.trim() };
  else {
    const base64 = Buffer.from(await arquivo!.arrayBuffer()).toString("base64");
    entrada = v.forma === "pdf" ? { tipo: "pdf", base64 } : { tipo: "imagem", mime: v.mime, base64 };
  }

  const r = await lerLista(entrada);
  if (!r.ok) return { erro: MENSAGENS[r.erro] };
  return { lista: r.lista, origem: arquivo ? arquivo.name : "texto colado" };
}
