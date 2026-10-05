// Para aplicar uma migração pelo conector do Neon (run_sql_transaction), que
// aceita uma lista de comandos e não um arquivo inteiro:
//
//   node scripts/neon/gerar-comandos.mjs db/migrations/<arquivo>.sql <arquivo>.sql
//
// Imprime o JSON da lista, já com o registro em controle.migracao no fim, para
// a migração e o registro entrarem na mesma transação. Comentário ANTES de um
// comando sai (não muda nada no banco); o de dentro de função fica.
//
// Depois de aplicar, compare impressao-schema.sql (e impressao-dados.sql, no
// seed) entre o Neon e um banco local montado por scripts/banco.mjs: o hash
// precisa ser o mesmo. É isso que prova que a transcrição não errou.
import { readFileSync } from "node:fs";
import { dividir } from "./dividir-sql.mjs";

const [, , arquivo, nome] = process.argv;
const comandos = dividir(readFileSync(arquivo, "utf8")).map((x) => x.replace(/^(\s*--[^\n]*\n)+/, "").trim());
if (nome) comandos.push(`insert into controle.migracao (nome) values ('${nome}')`);
console.error(`${comandos.length} comandos`);
console.log(JSON.stringify(comandos));
