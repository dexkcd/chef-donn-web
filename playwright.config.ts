import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;
const DB = "postgres://postgres@127.0.0.1:54329/chefdonn_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `${BASE}/login`,
    timeout: 240_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: DB,
      APP_URL: BASE,
      BETTER_AUTH_URL: BASE,
      BETTER_AUTH_SECRET: process.env.E2E_AUTH_SECRET ?? (process.env.E2E_AUTH_SECRET = randomBytes(32).toString("base64url")),
      BOOTSTRAP_OWNER_EMAIL: "owner@e2e.ph",
      ENABLE_DEV_MAILBOX: "1",
      AI_EXTRACTOR: "fake",
      PRICE_PROVIDER: "fake",
      AI_PLANNER: "fake",
      STORAGE_DRIVER: "fs",
      STORAGE_DIR: ".data/e2e-uploads",
    },
  },
});
