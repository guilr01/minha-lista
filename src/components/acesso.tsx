import Link from "next/link";
import { Logo } from "./logo";

// A moldura das telas de entrar e de cadastro.
export function MolduraDeAcesso({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-5 px-5 py-10">
      <Link href="/" className="self-start"><Logo /></Link>
      <div>
        <h1 className="titulo text-[28px] font-bold leading-tight">{titulo}</h1>
        <p className="mt-1.5 text-[15px] text-apagado">{subtitulo}</p>
      </div>
      {children}
    </main>
  );
}
