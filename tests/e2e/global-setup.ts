/** A fresh, migrated database for the end-to-end run. */
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import postgres from "postgres";
import { migrateDatabase } from "../../scripts/migrate";

const ADMIN = "postgres://postgres@127.0.0.1:54329/postgres";

export default async function setup() {
  try {
    const probe = postgres(ADMIN, { max: 1, connect_timeout: 2, onnotice: () => {} });
    await probe`select 1`;
    await probe.end();
  } catch {
    execFileSync("bash", ["scripts/pg-local.sh", "start"], { stdio: "inherit" });
  }
  const admin = postgres(ADMIN, { max: 1, onnotice: () => {} });
  await admin.unsafe("drop database if exists chefdonn_e2e with (force)");
  await admin.unsafe("create database chefdonn_e2e");
  await admin.end();
  await migrateDatabase("postgres://postgres@127.0.0.1:54329/chefdonn_e2e");
  rmSync(".data/e2e-uploads", { recursive: true, force: true });
}
