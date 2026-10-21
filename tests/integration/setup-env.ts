/** Runs before each test file: a fresh database cloned from the migrated template. */
import postgres from "postgres";

const admin = process.env.TEST_PG_ADMIN_URL ?? "postgres://postgres@127.0.0.1:54329/postgres";
const name = `chefdonn_t${process.env.VITEST_POOL_ID ?? "0"}_${process.pid}`;

const sql = postgres(admin, { max: 1, onnotice: () => {} });
await sql.unsafe(`drop database if exists ${name} with (force)`);
await sql.unsafe(`create database ${name} template chefdonn_tpl`);
await sql.end();

process.env.DATABASE_URL = admin.replace(/\/[^/]*$/, `/${name}`);
process.env.STORAGE_DRIVER = "fs";
process.env.STORAGE_DIR = `.data/test-uploads/${name}`;
process.env.AI_EXTRACTOR = "fake";
process.env.PRICE_PROVIDER = "fake";
process.env.AI_PLANNER = "fake";
process.env.DISABLE_SWEEPER = "1";
process.env.ALLOW_INSECURE_CALLBACKS = "1";
