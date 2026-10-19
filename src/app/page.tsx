import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { FormularioDeCadastro } from "@/app/cadastro/formulario";
import { Icone, type NomeIcone } from "@/components/icone";
import { Logo } from "@/components/logo";
import { botao, botaoContornoPequeno } from "@/components/ui";
import { usuarioAtual } from "@/lib/sessao";

export const metadata: Metadata = {
  title: { absolute: "Lista Pronta · venda as listas de material escolar da sua papelaria" },
  description: "Cadastre a sua papelaria, monte as listas das escolas com três faixas de preço e mande o link para os clientes.",
};

// A porta de entrada da PAPELARIA. Os pais nunca chegam aqui: chegam pelo
// link da papelaria (/nome-da-papelaria). Por isso esta página é cadastro.
const PASSOS: { icone: NomeIcone; titulo: string; texto: string }[] = [
  { icone: "etiqueta", titulo: "Cadastre o catálogo", texto: "Cada produto com até três faixas de preço: econômica, intermediária e premium." },
  { icone: "escola", titulo: "Monte as listas", texto: "Escolha a escola e a série e marque os itens que ela pede. Publicou, está no ar." },
  { icone: "compartilhar", titulo: "Mande o link ou o QR code", texto: "Os clientes escolhem a faixa, ajustam e pagam. Você recebe o pedido pronto para separar." },
];

export default async function Inicio() {
  const logado = await usuarioAtual();
  const host = (await headers()).get("host") ?? "listapronta";

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-5 py-4 lg:px-10">
        <Logo />
        <Link href={logado ? "/painel" : "/entrar"} className={botaoContornoPequeno}>
          {logado ? "Ir para o painel" : "Entrar"}
        </Link>
      </header>

      <main className="mx-auto grid w-full max-w-[1200px] flex-1 items-start gap-8 px-5 pb-12 pt-4 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-14 lg:px-10 lg:pt-10">
        <section className="flex flex-col gap-6">
          <span className="w-fit rounded-full bg-amarelo px-3 py-1 text-[13px] font-bold text-tinta">Para papelarias</span>
          <h1 className="titulo text-[32px] font-bold leading-[1.08] lg:text-[48px] lg:leading-[1.04]">
            Venda as listas de material escolar das escolas da sua região, pelo celular dos clientes.
          </h1>
          <p className="max-w-[560px] text-[17px] leading-relaxed text-apagado">
            Os clientes abrem o seu link, escolhem a escola e a série, veem a lista pronta em três faixas de
            preço, pagam e recebem tudo separado. Você só separa e entrega.
          </p>
          {!logado && <a href="#cadastro" className={`${botao} lg:hidden`}>Cadastrar minha papelaria</a>}
          <ol className="flex flex-col gap-3">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="flex items-start gap-3.5">
                <span className="flex size-11 flex-none items-center justify-center rounded-xl bg-azul-claro text-azul">
                  <Icone nome={p.icone} tamanho={22} />
                </span>
                <span className="flex flex-col gap-0.5">
                  <strong className="text-base">{i + 1}. {p.titulo}</strong>
                  <span className="text-[15px] leading-snug text-apagado">{p.texto}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="cadastro">
          {logado ? (
            <div className="flex flex-col gap-3 rounded-cartao border border-linha bg-cartao p-[22px]">
              <h2 id="cadastro" className="titulo text-2xl font-bold">Você já está conectado</h2>
              <p className="text-[15px] text-apagado">Siga para o painel da sua papelaria.</p>
              <Link href="/painel" className={botao}>Ir para o painel</Link>
            </div>
          ) : (
            <>
              <div>
                <h2 id="cadastro" className="titulo text-2xl font-bold">Cadastre a sua papelaria</h2>
                <p className="mt-1 text-[15px] text-apagado">Leva um minuto. Você escolhe o endereço do link que vai mandar para os clientes.</p>
              </div>
              <FormularioDeCadastro host={host} />
            </>
          )}
        </section>
      </main>
    </div>
  );
}
