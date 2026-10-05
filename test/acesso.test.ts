import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Só src/lib/db.ts conecta ao banco. Uma segunda conexão por fora escaparia
// da troca de papel (anon/authenticated) e, com isso, do RLS: rodaria como o
// dono do banco, que enxerga todas as papelarias.

function arquivos(pasta: string): string[] {
  return readdirSync(pasta).flatMap((n) => {
    const c = join(pasta, n);
    return statSync(c).isDirectory() ? arquivos(c) : /\.(ts|tsx)$/.test(n) ? [c] : [];
  });
}

describe("acesso ao banco", () => {
  it("nenhum arquivo de src importa o driver além de src/lib/db.ts", () => {
    const raiz = join(process.cwd(), "src");
    const todos = arquivos(raiz);
    expect(todos.length).toBeGreaterThan(20);
    const culpados = todos
      .filter((a) => /from ["']pg["']|require\(["']pg["']\)/.test(readFileSync(a, "utf8")))
      .map((a) => relative(process.cwd(), a));
    expect(culpados).toEqual(["src/lib/db.ts"]);
  });

  it("comoSistema é usado só onde não há usuário: pagamento e área pública", () => {
    const raiz = join(process.cwd(), "src");
    const usam = arquivos(raiz)
      .filter((a) => /comoSistema\(/.test(readFileSync(a, "utf8")))
      .map((a) => relative(process.cwd(), a))
      .sort();
    // Lista fechada: acrescentar um arquivo aqui é decisão, não detalhe.
    expect(usam).toEqual(["src/lib/area-publica.ts", "src/lib/pagamento/processar.ts"]);
  });
});
