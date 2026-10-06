import type { Metadata } from "next";
import { MolduraDeAcesso } from "@/components/acesso";
import { FormularioDeRecuperacao } from "./formulario";

export const metadata: Metadata = { title: "Esqueci a senha" };

export default function EsqueciASenha() {
  return (
    <MolduraDeAcesso titulo="Esqueci a senha" subtitulo="Enviamos um link para você criar uma senha nova.">
      <FormularioDeRecuperacao />
    </MolduraDeAcesso>
  );
}
