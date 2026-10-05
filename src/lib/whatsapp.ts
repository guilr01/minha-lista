/** Link wa.me para o número da papelaria (só dígitos, com ou sem 55). */
export function linkWhatsApp(numero: string | null, texto?: string): string | null {
  if (!numero) return null;
  const d = numero.replace(/\D/g, "");
  const comPais = d.length <= 11 ? "55" + d : d;
  return `https://wa.me/${comPais}${texto ? "?text=" + encodeURIComponent(texto) : ""}`;
}

/** (11) 98888-7777 */
export function formatarTelefone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? "(" + d : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatarCep(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
}
