import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components, Server Actions e Route Handlers. Usa a
// chave PÚBLICA e a sessão do cookie: quem decide o que cada um vê é a RLS
// do banco. A chave de serviço não passa por aqui.
export async function supabaseServidor() {
  const loja = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => loja.getAll(),
        setAll: (lista) => {
          try {
            for (const { name, value, options } of lista) loja.set(name, value, options);
          } catch {
            // Em Server Component o cookie não pode ser escrito; o middleware
            // da etapa (c) é quem renova a sessão.
          }
        },
      },
    },
  );
}
