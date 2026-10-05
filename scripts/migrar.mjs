// pnpm db:migrar : aplica as migrações pendentes no banco de DATABASE_URL.
// Atenção: com o Neon de produção, isto vale na hora para quem usa o sistema.
import pg from "pg";
import { migrar, urlDoBanco } from "./banco.mjs";

const client = new pg.Client({ connectionString: urlDoBanco() });
await client.connect();
try {
  const feitas = await migrar(client, { log: console.log });
  console.log(feitas.length ? `${feitas.length} migração(ões) aplicada(s).` : "Nada a aplicar.");
} finally {
  await client.end();
}
