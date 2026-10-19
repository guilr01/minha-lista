import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { TAMANHO_MAXIMO_BYTES, validarEntrada } from "@/lib/leitor/entrada";
import { lerLista } from "@/lib/leitor/extrair";
import { chaveDoItem, normalizarItens } from "@/lib/leitor/normalizar";
import type { ItemLido, ListaLida } from "@/lib/leitor/tipos";

const item = (p: Partial<ItemLido>): ItemLido => ({
  texto_original: "", nome: "", quantidade: 1, especificacoes: [], observacao: null, ...p,
});

describe("entrada do leitor", () => {
  it("exige uma coisa, e uma só", () => {
    expect(validarEntrada({})).toEqual({ ok: false, erro: "vazio" });
    expect(validarEntrada({ texto: "   " })).toEqual({ ok: false, erro: "vazio" });
    expect(validarEntrada({ arquivo: { tipo: "image/png", tamanho: 0 } })).toEqual({ ok: false, erro: "vazio" });
    expect(validarEntrada({ texto: "2 lápis", arquivo: { tipo: "image/png", tamanho: 10 } }))
      .toEqual({ ok: false, erro: "dois_ao_mesmo_tempo" });
  });

  it("aceita foto e PDF, recusa o resto e o que passa do tamanho", () => {
    expect(validarEntrada({ arquivo: { tipo: "image/jpeg", tamanho: 10 } })).toEqual({ ok: true, forma: "imagem", mime: "image/jpeg" });
    expect(validarEntrada({ arquivo: { tipo: "application/pdf", tamanho: 10 } })).toEqual({ ok: true, forma: "pdf" });
    expect(validarEntrada({ arquivo: { tipo: "image/heic", tamanho: 10 } })).toEqual({ ok: false, erro: "tipo_nao_aceito" });
    expect(validarEntrada({ arquivo: { tipo: "image/png", tamanho: TAMANHO_MAXIMO_BYTES + 1 } }))
      .toEqual({ ok: false, erro: "arquivo_grande" });
    expect(validarEntrada({ texto: "x".repeat(20_001) })).toEqual({ ok: false, erro: "texto_grande" });
  });
});

describe("normalização do que o modelo devolveu", () => {
  it("o mesmo item escrito duas vezes vira uma linha, com as quantidades somadas", () => {
    const r = normalizarItens([
      item({ texto_original: "2 lápis HB", nome: "Lápis preto", quantidade: 2, especificacoes: ["HB"] }),
      item({ texto_original: "1 lapis preto hb", nome: "lapis preto", quantidade: 1, especificacoes: ["hb"] }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].quantidade).toBe(3);
    expect(r[0].texto_original).toBe("2 lápis HB / 1 lapis preto hb");
  });

  it("especificação diferente é item diferente", () => {
    const r = normalizarItens([
      item({ nome: "Caderno universitário", especificacoes: ["10 matérias"] }),
      item({ nome: "Caderno universitário", especificacoes: ["1 matéria"] }),
    ]);
    expect(r).toHaveLength(2);
  });

  it("quantidade é inteira e positiva, espaço e especificação repetida somem, nome sem texto sai", () => {
    const r = normalizarItens([
      item({ nome: "  cola   branca ", quantidade: 0, especificacoes: [" 90 g ", "90 G", ""] }),
      item({ nome: "Borracha", quantidade: 2.6 }),
      item({ nome: "   " }),
    ]);
    expect(r.map((i) => [i.nome, i.quantidade, i.especificacoes])).toEqual([
      ["Cola branca", 1, ["90 g"]],
      ["Borracha", 3, []],
    ]);
  });

  it("a chave do item não depende de acento, caixa nem ordem das especificações", () => {
    expect(chaveDoItem({ nome: "Lápis de cor", especificacoes: ["24 cores", "Grande"] }))
      .toBe(chaveDoItem({ nome: "lapis de cor", especificacoes: ["grande", "24 CORES"] }));
  });
});

// Um cliente falso no lugar do SDK: o teste confere o que o leitor faz com
// cada resposta, sem chamar a API.
function clienteQueResponde(resposta: Partial<{ stop_reason: string; parsed_output: ListaLida | null }> | Error) {
  const pedidos: unknown[] = [];
  const cliente = {
    beta: {
      messages: {
        parse: async (params: unknown) => {
          pedidos.push(params);
          if (resposta instanceof Error) throw resposta;
          return { stop_reason: "end_turn", parsed_output: null, ...resposta };
        },
      },
    },
  } as unknown as Anthropic;
  return { cliente, pedidos };
}

describe("leitura pelo modelo", () => {
  const lida: ListaLida = {
    nao_e_lista: false,
    itens: [item({ texto_original: "2 borrachas", nome: "borracha", quantidade: 2 })],
    ilegiveis: [],
  };

  it("devolve a lista já normalizada", async () => {
    const { cliente } = clienteQueResponde({ parsed_output: lida });
    const r = await lerLista({ tipo: "texto", texto: "2 borrachas" }, cliente);
    expect(r).toEqual({ ok: true, lista: { ...lida, itens: [{ ...lida.itens[0], nome: "Borracha" }] } });
  });

  it("manda a foto como imagem e o PDF como documento", async () => {
    const { cliente, pedidos } = clienteQueResponde({ parsed_output: lida });
    await lerLista({ tipo: "imagem", mime: "image/png", base64: "AAAA" }, cliente);
    await lerLista({ tipo: "pdf", base64: "BBBB" }, cliente);
    const tipos = pedidos.map((p) => (p as { messages: { content: { type: string }[] }[] }).messages[0].content[0].type);
    expect(tipos).toEqual(["image", "document"]);
  });

  it("recusa, corte por tamanho e resposta fora do formato viram erro, não lista vazia", async () => {
    const recusa = clienteQueResponde({ stop_reason: "refusal" });
    expect(await lerLista({ tipo: "texto", texto: "x" }, recusa.cliente)).toEqual({ ok: false, erro: "recusado" });
    const cortada = clienteQueResponde({ stop_reason: "max_tokens", parsed_output: lida });
    expect(await lerLista({ tipo: "texto", texto: "x" }, cortada.cliente)).toEqual({ ok: false, erro: "resposta_invalida" });
    const vazia = clienteQueResponde({ parsed_output: null });
    expect(await lerLista({ tipo: "texto", texto: "x" }, vazia.cliente)).toEqual({ ok: false, erro: "resposta_invalida" });
  });

  it("limite de chamadas da API tem mensagem própria", async () => {
    const { cliente } = clienteQueResponde(new Anthropic.RateLimitError(429, undefined, "rate", new Headers()));
    expect(await lerLista({ tipo: "texto", texto: "x" }, cliente)).toEqual({ ok: false, erro: "muitas_chamadas" });
  });

  it("sem chave, nem tenta chamar", async () => {
    const antes = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(await lerLista({ tipo: "texto", texto: "x" })).toEqual({ ok: false, erro: "sem_chave" });
    } finally {
      if (antes !== undefined) process.env.ANTHROPIC_API_KEY = antes;
    }
  });
});

describe("o leitor é um módulo à parte", () => {
  it("src/lib/leitor não importa nada do aplicativo, para poder ir ao agregador inteiro", () => {
    const pasta = join(process.cwd(), "src/lib/leitor");
    const arquivos = readdirSync(pasta).filter((n) => n.endsWith(".ts"));
    expect(arquivos.length).toBeGreaterThanOrEqual(4);
    for (const n of arquivos) {
      const imports = [...readFileSync(join(pasta, n), "utf8").matchAll(/from ["']([^"']+)["']/g)].map((m) => m[1]);
      const deFora = imports.filter((i) => !i.startsWith("./") && !["zod", "server-only"].includes(i) && !i.startsWith("@anthropic-ai/sdk"));
      expect(deFora, n).toEqual([]);
    }
  });
});
