import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import QRCode from "qrcode";
import { Icone } from "@/components/icone";
import { botaoContornoPequeno, cartao, link } from "@/components/ui";
import { buscarPapelaria } from "@/lib/area-publica";
import { enderecoPublico } from "@/lib/endereco";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { Copiar, ImprimirCartaz } from "./interativos";

export const metadata: Metadata = { title: "Divulgar" };

// O que a papelaria manda para os pais: o link da loja, o QR code dele (para
// o balcão e o grupo da escola) e o link direto de cada série publicada.
// A lista de séries vem da MESMA vitrine que os pais veem: só aparece aqui o
// que de fato abre lá.
export default async function Divulgar() {
  const u = await exigirUsuario();
  const papelaria = (await papelariaAtual(u.id))!;
  const base = enderecoPublico((await headers()).get("host"));
  const endereco = `${base}/${papelaria.slug}`;
  const vitrine = await buscarPapelaria(papelaria.slug);
  const escolas = vitrine?.escolas ?? [];

  const cores = { dark: "#1B2430", light: "#FFFFFF" };
  const [qrSvg, qrPng] = await Promise.all([
    QRCode.toString(endereco, { type: "svg", margin: 1, color: cores }),
    QRCode.toDataURL(endereco, { margin: 2, width: 1024, color: cores }),
  ]);
  const mensagem = `Olá! A lista de material escolar já está na ${papelaria.nome}. Escolha a escola e a série, confira a lista e faça o pedido por aqui: ${endereco}`;
  const whats = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;

  return (
    <>
      <div className="print:hidden">
        <h1 className="titulo text-2xl font-bold lg:text-[30px]">Divulgar</h1>
        <p className="leitura mt-1.5 text-[15px] lg:text-base text-apagado">
          Mande o link da sua loja para os clientes ou deixe o QR code no balcão. Quem abrir escolhe a escola, a série e faz o pedido.
        </p>

        {/* Duas colunas só a partir de 1280 px: em 1024 o link quebrava no meio da palavra. */}
        <div className="mt-[18px] grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-5">
            <section className={`${cartao} flex flex-col gap-3 p-[18px] lg:p-[22px]`}>
              <h2 className="text-base font-bold">Link da sua loja</h2>
              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded-campo border border-campo bg-[#fbfaf6] px-3 py-2.5 text-[15px] lg:text-base">{endereco}</code>
                <Copiar texto={endereco} />
              </div>
              <div className="flex flex-wrap gap-2.5">
                <a href={whats} target="_blank" rel="noopener noreferrer" className={botaoContornoPequeno}>
                  <Icone nome="conversa" tamanho={18} />Enviar pelo WhatsApp
                </a>
                <Link href={`/${papelaria.slug}`} target="_blank" className={botaoContornoPequeno}>
                  <Icone nome="seta" tamanho={18} />Ver como os clientes veem
                </Link>
              </div>
            </section>

            <section className={`${cartao} flex flex-col gap-3 p-[18px] lg:p-[22px]`}>
              <div>
                <h2 className="text-base font-bold">Link de cada série</h2>
                <p className="mt-0.5 text-[13px] lg:text-sm text-apagado">
                  Para o grupo de uma turma: o link já abre direto na lista daquela série.
                </p>
              </div>
              {escolas.length === 0 ? (
                <p className="text-sm lg:text-[15px] text-apagado">
                  Nenhuma lista publicada ainda. Publique em <Link href="/painel/escolas" className={link}>Escolas e listas</Link> e os links aparecem aqui.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-linha-2">
                  {escolas.flatMap((e) => e.series.map((s) => {
                    const url = `${endereco}/${e.slug}/${s.slug}`;
                    return (
                      <li key={url} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0">
                          <strong className="text-[15px] lg:text-base">{s.nome}</strong>
                          <span className="text-[15px] lg:text-base text-apagado"> · {e.nome}</span>
                        </span>
                        <Copiar texto={url} rotulo="Copiar link" />
                      </li>
                    );
                  }))}
                </ul>
              )}
            </section>
          </div>

          <section className={`${cartao} flex flex-col items-center gap-3 p-[18px] text-center lg:p-[22px]`}>
            <h2 className="self-start text-base font-bold">QR code da loja</h2>
            <div className="w-full max-w-[240px]" role="img" aria-label={`QR code para ${endereco}`}
              dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <p className="text-[13px] lg:text-sm text-apagado">Aponte a câmera do celular para abrir a sua loja.</p>
            <div className="flex w-full flex-col gap-2">
              <a href={qrPng} download={`qrcode-${papelaria.slug}.png`} className={botaoContornoPequeno}>
                Baixar imagem
              </a>
              <ImprimirCartaz />
            </div>
          </section>
        </div>
      </div>

      {/* Só no papel: o cartaz para o balcão. */}
      <div className="hidden flex-col items-center gap-6 pt-10 text-center text-black print:flex">
        <p className="text-[28pt] font-bold leading-tight">Lista de material escolar</p>
        <p className="text-[18pt]">{papelaria.nome}</p>
        <div className="w-[11cm]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
        <p className="text-[16pt]">Aponte a câmera do celular, escolha a escola e a série e faça o seu pedido.</p>
        <p className="text-[13pt]">{endereco}</p>
      </div>
    </>
  );
}
