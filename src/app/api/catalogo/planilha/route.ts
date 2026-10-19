import { listarProdutos } from "@/lib/cadastro";
import { gerarPlanilha } from "@/lib/planilha-catalogo";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";

// GET ?catalogo=1 → o catálogo atual, para editar e subir de volta.
// Sem parâmetro → o modelo em branco.
export async function GET(req: Request) {
  const u = await exigirUsuario();
  const p = await papelariaAtual(u.id);
  if (!p) return new Response("Sem papelaria", { status: 404 });
  const comCatalogo = new URL(req.url).searchParams.has("catalogo");
  const produtos = comCatalogo ? (await listarProdutos(u.id, p.id)).filter((x) => x.ativo) : [];
  const arquivo = await gerarPlanilha(produtos);
  const nome = comCatalogo ? `catalogo-${p.slug}.xlsx` : "modelo-catalogo-lista-pronta.xlsx";
  return new Response(arquivo as BodyInit, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nome}"`,
      "cache-control": "private, no-store",
    },
  });
}
