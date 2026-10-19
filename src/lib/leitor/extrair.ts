import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { normalizarLista } from "./normalizar";
import { ListaLidaSchema, type EntradaDoLeitor, type ListaLida } from "./tipos";

// A ÚNICA chamada ao modelo de linguagem. Recebe a lista (texto, foto ou PDF) e
// devolve os itens com nome padronizado, quantidade e especificações. Ler e
// padronizar é tudo que ela faz: casar com produto é outra etapa, com regra
// própria, e não fica escondida num prompt.
//
// Saída estruturada (output_config.format): o modelo responde no formato de
// ListaLidaSchema, e o SDK já devolve o objeto conferido.

export const MODELO_DO_LEITOR = "claude-opus-5-5";

const INSTRUCOES = `Você lê listas de material escolar e de compras enviadas por clientes brasileiros: fotos de papel, PDFs da escola ou texto colado.

Para cada produto da lista, devolva:
- texto_original: o trecho exatamente como está escrito.
- nome: o nome padronizado do produto, no singular, sem quantidade e sem especificação. Ex.: "Caderno universitário", "Lápis preto", "Cola branca", "Papel sulfite".
- quantidade: o número de unidades pedido. Sem número escrito, 1. "1 pacote com 100 folhas" é quantidade 1, e "100 folhas" vai para especificações.
- especificacoes: características curtas que mudam o produto que se compra: "10 matérias", "nº 2", "HB", "caixa com 12", "90 g", "capa dura", "A4", "tamanho 40 g". Sem especificação, lista vazia.
- observacao: um pedido que não é característica do produto, como "etiquetar com o nome do aluno" ou "marca de preferência Faber-Castell". Sem nada, null.

Regras:
- Não invente item. Cabeçalho, nome da escola, série, datas e instruções gerais ("entregar até o dia 10") não são itens.
- Um item por produto. "2 lápis e 1 borracha" são dois itens.
- Escreva nome e especificações em português do Brasil, com acento.
- Trecho que parece produto mas não dá para ler com segurança vai em ilegiveis, como está, e não em itens.
- Se o conteúdo não for uma lista de produtos, nao_e_lista é true e itens fica vazio.`;

export type ErroDoLeitor = "sem_chave" | "recusado" | "resposta_invalida" | "muitas_chamadas" | "indisponivel";
export type ResultadoDoLeitor = { ok: true; lista: ListaLida } | { ok: false; erro: ErroDoLeitor };

function conteudo(entrada: EntradaDoLeitor): Anthropic.Beta.BetaContentBlockParam[] {
  const pedido = { type: "text" as const, text: "Leia esta lista." };
  switch (entrada.tipo) {
    case "texto":
      return [{ type: "text", text: `<lista>\n${entrada.texto}\n</lista>` }, pedido];
    case "imagem":
      return [{ type: "image", source: { type: "base64", media_type: entrada.mime, data: entrada.base64 } }, pedido];
    case "pdf":
      return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: entrada.base64 } }, pedido];
  }
}

/** `cliente` existe para o teste; a aplicação usa o padrão, que lê ANTHROPIC_API_KEY. */
export async function lerLista(entrada: EntradaDoLeitor, cliente?: Anthropic): Promise<ResultadoDoLeitor> {
  if (!cliente && !process.env.ANTHROPIC_API_KEY) return { ok: false, erro: "sem_chave" };
  const c = cliente ?? new Anthropic();

  try {
    const r = await c.beta.messages.parse({
      model: MODELO_DO_LEITOR,
      max_tokens: 16000,
      // O padrão do Opus 5.5 é "medium", e ele é escrito aqui para a escolha
      // ficar à vista: ler lista não pede mais que isso.
      output_config: { effort: "medium", format: betaZodOutputFormat(ListaLidaSchema) },
      // Se o filtro de segurança recusar, o próprio servidor tenta de novo no
      // modelo que a Anthropic indica para aquele caso.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: INSTRUCOES,
      messages: [{ role: "user", content: conteudo(entrada) }],
    });

    if (r.stop_reason === "refusal") return { ok: false, erro: "recusado" };
    // Corte por max_tokens deixa o JSON pela metade, e o SDK devolve null.
    if (r.stop_reason === "max_tokens" || !r.parsed_output) return { ok: false, erro: "resposta_invalida" };
    return { ok: true, lista: normalizarLista(r.parsed_output) };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, erro: "muitas_chamadas" };
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("[leitor] chave recusada pela API");
      return { ok: false, erro: "sem_chave" };
    }
    if (e instanceof Anthropic.APIError) {
      console.error("[leitor] API respondeu", e.status, e.message);
      return { ok: false, erro: "indisponivel" };
    }
    // Erro do SDK ao conferir o formato também cai aqui.
    console.error("[leitor]", e);
    return { ok: false, erro: "resposta_invalida" };
  }
}
