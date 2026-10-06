import type { Metadata } from "next";
import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Icone } from "@/components/icone";
import { botaoContornoPequeno, botaoPequeno, campo, cartao, rotuloCampo } from "@/components/ui";
import { listarEscolas, type ResumoDaLista } from "@/lib/cadastro";
import { exigirUsuario, papelariaAtual } from "@/lib/sessao";
import { criarEscolaAcao, criarListaAcao, criarSerieAcao, excluirEscolaAcao, excluirSerieAcao } from "../cadastro-acoes";

export const metadata: Metadata = { title: "Escolas e listas" };

const ROTULO_LISTA: Record<ResumoDaLista["status"], string> = {
  rascunho: "Rascunho",
  publicada: "Publicada",
  encerrada: "Encerrada",
};
const COR_LISTA: Record<ResumoDaLista["status"], string> = {
  rascunho: "bg-aviso-fundo text-aviso",
  publicada: "bg-ok-fundo text-ok",
  encerrada: "bg-linha-2 text-apagado",
};

// O ano letivo que se monta agora: a partir de agosto, a lista é a do ano
// seguinte (é quando as escolas mandam as listas novas).
function anoSugerido(agora = new Date()) {
  return agora.getMonth() >= 7 ? agora.getFullYear() + 1 : agora.getFullYear();
}

export default async function Escolas() {
  const u = await exigirUsuario();
  const papelaria = (await papelariaAtual(u.id))!;
  const escolas = await listarEscolas(u.id, papelaria.id);
  const ano = anoSugerido();

  return (
    <>
      <h1 className="titulo text-2xl font-bold lg:text-[30px]">Escolas e listas</h1>
      <p className="mt-1 text-[15px] text-apagado">
        Cada série tem uma lista por ano letivo. Os pais só veem a lista publicada.
      </p>

      <section className={`${cartao} mt-5 p-4 lg:p-[22px]`}>
        <h2 className="mb-3 text-base font-bold">Nova escola</h2>
        <FormAcao acao={criarEscolaAcao} limparAoSalvar className="flex flex-wrap items-end gap-3">
          <label className={`${rotuloCampo} min-w-[220px] flex-[2]`}>Nome<input name="nome" required className={campo} placeholder="Ex.: Colégio Modelo" /></label>
          <label className={`${rotuloCampo} min-w-[160px] flex-1`}>Cidade<input name="cidade" className={campo} /></label>
          <button type="submit" className={botaoPequeno}><Icone nome="mais" tamanho={18} />Adicionar escola</button>
        </FormAcao>
      </section>

      {escolas.length === 0 && (
        <p className="mt-6 text-center text-apagado">Nenhuma escola ainda. Cadastre a primeira acima.</p>
      )}

      <div className="mt-5 flex flex-col gap-4">
        {escolas.map((e) => (
          <section key={e.id} className={`${cartao} overflow-hidden`} aria-labelledby={`esc-${e.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-linha px-4 py-3.5 lg:px-[22px]">
              <div className="flex items-center gap-3">
                <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-azul-claro text-azul"><Icone nome="escola" /></span>
                <div>
                  <h2 id={`esc-${e.id}`} className="text-[17px] font-bold">{e.nome}</h2>
                  <span className="text-[13px] text-apagado">{e.cidade ? `${e.cidade} · ` : ""}/{papelaria.slug}/{e.slug}</span>
                </div>
              </div>
              {e.series.length === 0 && (
                <FormAcao acao={excluirEscolaAcao} confirmar={`Excluir a escola “${e.nome}”?`}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" className="min-h-11 text-sm font-semibold text-erro hover:underline">Excluir escola</button>
                </FormAcao>
              )}
            </div>

            <ul>
              {e.series.map((s) => {
                const temDoAno = s.listas.some((l) => l.ano_letivo === ano);
                return (
                  <li key={s.id} className="flex flex-col gap-2.5 border-b border-linha-2 px-4 py-3.5 lg:flex-row lg:items-start lg:justify-between lg:px-[22px]">
                    <div className="flex min-w-0 flex-col gap-2">
                      <strong className="text-[15px]">{s.nome}</strong>
                      {s.listas.length === 0 ? (
                        <span className="text-[13px] text-apagado">Sem lista ainda.</span>
                      ) : (
                        <ul className="flex flex-wrap gap-2">
                          {s.listas.map((l) => (
                            <li key={l.id}>
                              <Link href={`/painel/listas/${l.id}`}
                                className="flex min-h-11 items-center gap-2 rounded-xl border border-linha bg-white px-3 text-sm hover:border-azul">
                                <strong>{l.ano_letivo}</strong>
                                <span className={`inline-flex h-6 items-center rounded-full px-2 text-xs font-bold ${COR_LISTA[l.status]}`}>{ROTULO_LISTA[l.status]}</span>
                                <span className="text-apagado">{l.itens} {l.itens === 1 ? "item" : "itens"}{l.pedidos ? ` · ${l.pedidos} pedidos` : ""}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!temDoAno && (
                        <FormAcao acao={criarListaAcao} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="serie" value={s.id} />
                          <input type="hidden" name="ano" value={ano} />
                          {s.listas.length > 0 && <input type="hidden" name="copiar_de" value={s.listas[0].id} />}
                          <button type="submit" className={botaoContornoPequeno}>
                            <Icone nome="mais" tamanho={18} />
                            {s.listas.length > 0 ? `Lista de ${ano} (copiar ${s.listas[0].ano_letivo})` : `Montar lista de ${ano}`}
                          </button>
                        </FormAcao>
                      )}
                      {s.listas.length === 0 && (
                        <FormAcao acao={excluirSerieAcao} confirmar={`Excluir a série “${s.nome}”?`}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="min-h-11 px-2 text-sm font-semibold text-erro hover:underline">Excluir</button>
                        </FormAcao>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            <FormAcao acao={criarSerieAcao} limparAoSalvar className="flex flex-wrap items-end gap-3 bg-[#fbfaf6] px-4 py-3.5 lg:px-[22px]">
              <input type="hidden" name="escola" value={e.id} />
              <label className={`${rotuloCampo} min-w-[200px] flex-1`}>
                Nova série
                <input name="nome" required className={campo} placeholder="Ex.: 3º ano" />
              </label>
              <button type="submit" className={botaoContornoPequeno}><Icone nome="mais" tamanho={18} />Adicionar série</button>
            </FormAcao>
          </section>
        ))}
      </div>
    </>
  );
}
