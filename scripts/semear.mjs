// pnpm db:semear : dados de exemplo (1 papelaria, 2 escolas, 4 séries,
// 22 produtos). Idempotente.
import pg from "pg";
import { semear, urlDoBanco } from "./banco.mjs";

const client = new pg.Client({ connectionString: urlDoBanco() });
await client.connect();
try {
  await semear(client);
  console.log("Seed aplicado.");
} finally {
  await client.end();
}
