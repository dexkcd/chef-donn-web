/**
 * Builds a migrated template database once per run. Each test file then gets its own copy
 * (setup-env.ts), so files never see each other's rows.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { migrateDatabase } from "../../scripts/migrate";

export const PG_ADMIN_URL = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
export const TEMPLATE_DB = "chefdonn_tpl";

async function reachable(): Promise<boolean> {
  const sql = postgres(PG_ADMIN_URL, { max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end();
  }
}

export default async function setup() {
  if (!(await reachable())) {
    execFileSync("bash", ["scripts/pg-local.sh", "start"], { stdio: "inherit" });
  }
  const admin = postgres(PG_ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${TEMPLATE_DB} with (force)`);
    await admin.unsafe(`create database ${TEMPLATE_DB}`);
  } finally {
    await admin.end();
  }
  await migrateDatabase(PG_ADMIN_URL.replace(/\/[^/]*$/, `/${TEMPLATE_DB}`));
}
