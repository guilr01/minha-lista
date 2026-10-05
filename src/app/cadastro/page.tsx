import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MolduraDeAcesso } from "@/components/acesso";
import { usuarioAtual } from "@/lib/sessao";
import { FormularioDeCadastro } from "./formulario";

export const metadata: Metadata = { title: "Cadastrar a papelaria" };

export default async function Cadastro() {
  if (await usuarioAtual()) redirect("/painel");
  const host = (await headers()).get("host") ?? "listapronta";
  return (
    <MolduraDeAcesso titulo="Cadastrar a papelaria" subtitulo="Você cria a conta e escolhe o endereço do link que vai mandar para os pais.">
      <FormularioDeCadastro host={host} />
    </MolduraDeAcesso>
  );
}
