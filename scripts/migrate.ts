/** Apply migrations and sync roadmap templates. Used locally, in tests, and as Railway's pre-deploy step. */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { DEFAULT_DATABASE_URL } from "../src/db/client";
import * as schema from "../src/db/schema";
import { syncTemplates } from "../src/db/seed/sync";

export async function migrateDatabase(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: new URL("../src/db/migrations", import.meta.url).pathname });
    const n = await syncTemplates(db);
    console.info(`migrated ${url.replace(/\/\/[^@]*@/, "//***@")} · ${n} roadmap templates`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrateDatabase(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
