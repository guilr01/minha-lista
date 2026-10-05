import { Logo } from "@/components/logo";

// Página da plataforma. Os pais não chegam aqui: chegam pelo link da
// papelaria (/nome-da-papelaria), que é a vitrine dela.
export default function Inicio() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-5 py-12">
      <Logo />
      <h1 className="titulo text-[30px] font-bold leading-[1.1] sm:text-[46px]">
        A lista de material escolar pronta, da papelaria para a casa dos pais.
      </h1>
      <p className="text-[17px] leading-relaxed text-apagado">
        A papelaria cadastra as listas das escolas com três faixas de preço. Os pais abrem o
        link, escolhem a faixa, ajustam item a item, pagam e recebem tudo separado.
      </p>
    </main>
  );
}
