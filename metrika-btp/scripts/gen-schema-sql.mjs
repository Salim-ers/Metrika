import fs from "node:fs";

const sql = fs.readFileSync("prisma/init.sql", "utf8");
const esc = sql
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const ts = `// ⚠️ Fichier généré depuis prisma/init.sql (ne pas éditer à la main).
// DDL PostgreSQL complet du schéma, utilisé par db-init.ts pour créer les
// tables automatiquement au 1er démarrage sur Vercel (Neon).
export const SCHEMA_SQL = \`${esc}\`;
`;

fs.writeFileSync("src/lib/db-schema-sql.ts", ts);
console.log("written src/lib/db-schema-sql.ts:", ts.length, "chars");
