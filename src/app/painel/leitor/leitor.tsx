"use client";

import { startTransition, useActionState } from "react";
import { Icone } from "@/components/icone";
import { Aviso, Informacao, botaoPequeno, campo, cartao, rotuloCampo } from "@/components/ui";
import { lerListaAcao, type EstadoDoLeitor } from "./acoes";

// O envio é feito no onSubmit, como em FormAcao: o <form action> do React 19
// limpa o formulário depois do envio, e quem colou uma lista inteira a perderia
// na primeira leitura que falhasse.
export function LeitorDeLista() {
  const [estado, enviar, pendente] = useActionState<EstadoDoLeitor, FormData>(lerListaAcao, {});

  return (
    <>
      <section className={`${cartao} mt-5 p-4 lg:p-[22px]`}>
        <form action={enviar} className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            startTransition(() => enviar(dados));
          }}>
          <fieldset disabled={pendente} className="contents">
            <label className={rotuloCampo}>
              Foto ou PDF da lista
              <input type="file" name="arquivo" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                className="text-[15px] font-normal file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-azul-claro file:px-4 file:font-semibold file:text-azul" />
            </label>
            <p className="text-[13px] text-apagado">ou</p>
            <label className={rotuloCampo}>
              Texto da lista
              <textarea name="texto" rows={8} className={`${campo} h-auto py-2.5 leading-snug`}
                placeholder={"Ex.:\n2 cadernos universitários 10 matérias\n1 caixa de lápis de cor 24 cores\n3 lápis HB"} />
            </label>
            <div>
              <button type="submit" className={botaoPequeno}>
                <Icone nome="lista" tamanho={18} />{pendente ? "Lendo a lista…" : "Ler lista"}
              </button>
            </div>
          </fieldset>
          {estado.erro && <p role="alert" className="text-sm font-semibold text-erro">{estado.erro}</p>}
        </form>
      </section>

      {estado.lista && <Resultado estado={estado} />}
    </>
  );
}

function Resultado({ estado }: { estado: EstadoDoLeitor }) {
  const { itens, ilegiveis, nao_e_lista } = estado.lista!;
  return (
    <section className={`${cartao} mt-5 overflow-hidden`} aria-labelledby="resultado">
      <div className="border-b border-linha px-4 py-3.5 lg:px-[22px]">
        <h2 id="resultado" className="text-[17px] font-bold">
          {itens.length === 1 ? "1 item lido" : `${itens.length} itens lidos`}
        </h2>
        <span className="text-[13px] text-apagado">{estado.origem}</span>
      </div>

      <div className="flex flex-col gap-3 px-4 py-3.5 lg:px-[22px]">
        {nao_e_lista && <Aviso>Isto não parece uma lista de produtos.</Aviso>}
        {ilegiveis.length > 0 && (
          <Aviso>
            <strong>Não deu para ler com segurança:</strong>
            <ul className="mt-1 list-disc pl-5">{ilegiveis.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </Aviso>
        )}
      </div>

      {itens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <thead className="bg-fundo text-[13px] text-apagado">
              <tr>
                <th className="px-4 py-2.5 font-semibold lg:px-[22px]">Item</th>
                <th className="px-3 py-2.5 text-right font-semibold">Qtd.</th>
                <th className="px-3 py-2.5 font-semibold">Especificações</th>
                <th className="px-4 py-2.5 font-semibold lg:px-[22px]">Como estava escrito</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i, n) => (
                <tr key={n} className="border-t border-linha-2 align-top">
                  <td className="px-4 py-3 lg:px-[22px]">
                    <strong>{i.nome}</strong>
                    {i.observacao && <span className="block text-[13px] text-apagado">{i.observacao}</span>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{i.quantidade}</td>
                  <td className="px-3 py-3">{i.especificacoes.length ? i.especificacoes.join(" · ") : <span className="text-apagado">—</span>}</td>
                  <td className="px-4 py-3 text-[13px] text-apagado lg:px-[22px]">{i.texto_original}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-4 py-3.5 lg:px-[22px]">
        <Informacao>Nada foi gravado. Esta tela só mostra o que o leitor entendeu, para conferir a qualidade da leitura.</Informacao>
      </div>
    </section>
  );
}
