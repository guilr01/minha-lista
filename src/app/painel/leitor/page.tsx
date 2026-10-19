import type { Metadata } from "next";
import { Aviso } from "@/components/ui";
import { exigirUsuario } from "@/lib/sessao";
import { leitorLiberado } from "./acoes";
import { LeitorDeLista } from "./leitor";

export const metadata: Metadata = { title: "Ler lista" };

// A leitura de uma foto pode levar dezenas de segundos. A Server Action roda
// no tempo desta página.
export const maxDuration = 120;

// Fora do menu de propósito: é protótipo do módulo que a Lista Pronta e o
// agregador de afiliados vão dividir, e não muda o fluxo da papelaria.
export default async function Leitor() {
  await exigirUsuario();
  const liberado = await leitorLiberado();

  return (
    <>
      <h1 className="titulo text-2xl font-bold lg:text-[30px]">Ler lista</h1>
      <p className="mt-1 text-[15px] text-apagado">
        Envie a foto, o PDF ou o texto de uma lista. O leitor devolve cada item com nome padronizado, quantidade e especificações.
      </p>
      {liberado ? <LeitorDeLista /> : (
        <div className="mt-5"><Aviso>O leitor de listas não está liberado neste ambiente.</Aviso></div>
      )}
    </>
  );
}
