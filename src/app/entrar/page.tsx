import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MolduraDeAcesso } from "@/components/acesso";
import { usuarioAtual } from "@/lib/sessao";
import { FormularioDeEntrada } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function Entrar() {
  if (await usuarioAtual()) redirect("/painel");
  return (
    <MolduraDeAcesso titulo="Entrar no painel" subtitulo="Pedidos, separação e entregas da sua papelaria.">
      <FormularioDeEntrada />
    </MolduraDeAcesso>
  );
}
