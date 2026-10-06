import "server-only";

// Ponto de envio de e-mail, num lugar só, como o pagamento. Hoje um provedor:
// Resend (https://resend.com), ligado por duas variáveis. Sem elas, nada sai:
// no desenvolvimento a mensagem vai para o log, para dar para testar; em
// produção o log diz só que não foi enviada, porque a mensagem de recuperação
// carrega um link que troca a senha de alguém.

export type Mensagem = { para: string; assunto: string; texto: string; html: string };

export function emailConfigurado(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_REMETENTE);
}

export async function enviarEmail(m: Mensagem): Promise<void> {
  if (!emailConfigurado()) {
    if (process.env.NODE_ENV === "production") {
      console.warn(`[email] RESEND_API_KEY ou EMAIL_REMETENTE ausente: "${m.assunto}" não foi enviado`);
    } else {
      console.info(`[email] (sem provedor, só no log)\npara: ${m.para}\nassunto: ${m.assunto}\n\n${m.texto}`);
    }
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_REMETENTE, to: [m.para], subject: m.assunto, text: m.texto, html: m.html }),
  });
  if (!r.ok) {
    // Não derruba quem pediu: a tela já respondeu, e a resposta é a mesma
    // com ou sem conta. Fica no log para quem cuida do sistema.
    console.error(`[email] o provedor recusou "${m.assunto}": ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
}

// ------------------------------------------------------------- mensagens
// E-mail não lê o CSS do site: as cores são as do @theme de globals.css,
// copiadas (tinta, azul, apagado).

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function mensagemDeRecuperacao(para: string, nome: string | null, link: string, validadeMinutos: number): Mensagem {
  const ola = nome ? `Olá, ${nome}.` : "Olá.";
  const validade = validadeMinutos >= 60 ? `${validadeMinutos / 60} hora${validadeMinutos > 60 ? "s" : ""}` : `${validadeMinutos} minutos`;
  const texto = [
    ola,
    "",
    "Recebemos um pedido para criar uma senha nova no painel da Lista Pronta.",
    "Para continuar, abra o link abaixo:",
    "",
    link,
    "",
    `O link vale por ${validade} e só funciona uma vez.`,
    "Se não foi você quem pediu, ignore este e-mail: a sua senha continua a mesma.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1b2430">
<p>${escapar(ola)}</p>
<p>Recebemos um pedido para criar uma senha nova no painel da Lista Pronta.</p>
<p><a href="${escapar(link)}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#1f4f8f;color:#fff;font-weight:600;text-decoration:none">Criar senha nova</a></p>
<p style="color:#5a6472;font-size:13px">O link vale por ${validade} e só funciona uma vez. Se não foi você quem pediu, ignore este e-mail: a sua senha continua a mesma.</p>
</div>`;
  return { para, assunto: "Criar senha nova · Lista Pronta", texto, html };
}
