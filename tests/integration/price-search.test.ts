import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { moneyLine, priceObservation, priceSearch, task, workspace } from "@/db/schema";
import { authenticateApiKey, createApiKey, createApiKeyInput, revokeApiKey } from "@/server/api-keys";
import { runAction, type Principal } from "@/server/context";
import { env } from "@/server/env";
import { runPriceSearch, sweepPriceSearches } from "@/server/jobs/price-search";
import { applyPriceEstimate, applyPriceInput, createPriceSearch, getPriceSearch, priceSearchInput, serialisePriceSearch } from "@/server/services/prices";
import { onboard, onboardInput } from "@/server/services/roadmap";
import { verifySignature } from "@/server/webhooks";
import { expectOk, makeWorkspace } from "./helpers";

const received: { body: string; headers: IncomingMessage["headers"] }[] = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ body, headers: req.headers });
    res.writeHead(200).end("ok");
  });
});
let callbackUrl = "";
beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  callbackUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function setup() {
  const w = await makeWorkspace();
  expectOk(await runAction(w.ownerPrincipal, "profile.edit", onboardInput, { name: "K", startingPoint: "building" }, onboard));
  const key = expectOk(await runAction(w.ownerPrincipal, "api_keys.manage", createApiKeyInput, { name: "n8n", scopes: ["prices:search"] }, createApiKey));
  const auth = await authenticateApiKey(`Bearer ${key.secret}`);
  if (!auth?.ok) throw new Error("key should authenticate");
  return { ...w, key, apiPrincipal: auth.principal };
}

const search = (p: Principal, body: unknown) => runAction(p, "prices.search", priceSearchInput, body, (ctx, input) => createPriceSearch(ctx, input, "api"));

describe("price-search hook", () => {
  it("authenticates API keys and refuses missing, unknown and revoked ones", async () => {
    const { key, ownerPrincipal } = await setup();
    expect(await authenticateApiKey(null)).toBeNull();
    expect(await authenticateApiKey("Bearer nope")).toMatchObject({ ok: false, status: 401 });
    expect(await authenticateApiKey("Bearer cdk_unknown")).toMatchObject({ ok: false, status: 401 });
    expectOk(await runAction(ownerPrincipal, "api_keys.manage", (await import("zod")).z.object({ keyId: (await import("zod")).z.uuid() }), { keyId: key.id }, revokeApiKey));
    expect(await authenticateApiKey(`Bearer ${key.secret}`)).toMatchObject({ ok: false, status: 403 });
  });

  it("a read-only key can't trigger a search", async () => {
    const { ownerPrincipal } = await setup();
    const ro = expectOk(await runAction(ownerPrincipal, "api_keys.manage", createApiKeyInput, { name: "dash", scopes: ["prices:read"] }, createApiKey));
    const auth = await authenticateApiKey(`Bearer ${ro.secret}`);
    const r = await search((auth as { principal: Principal }).principal, { query: "2-door chiller" });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("queues, runs with the provider, stores sourced observations and a summary, and calls back signed", async () => {
    const { ws, apiPrincipal } = await setup();
    const [t] = await db.select().from(task).where(and(eq(task.workspaceId, ws.id), eq(task.templateKey, "ph.build.kitchen_equipment")));
    const created = expectOk(await search(apiPrincipal, { query: "2-door commercial chiller", subject: { type: "task", id: t!.id }, callbackUrl }));
    expect(created.search.status).toBe("queued");

    received.length = 0;
    expect(await runPriceSearch(created.search.id)).toBe("done");
    // A second worker can't run it again.
    expect(await runPriceSearch(created.search.id)).toBe("skipped");

    const found = (await getPriceSearch(db, ws.id, created.search.id))!;
    expect(found.search.status).toBe("done");
    // The fake provider returns one unsourced price; it must be dropped.
    expect(found.observations.every((o) => o.sourceUrl.startsWith("https://example.com/"))).toBe(true);
    expect(found.search.summary).toMatchObject({ count: 4, outliersDropped: 1 });

    expect(received).toHaveLength(1);
    const [secret] = await db.select({ s: workspace.webhookSecret }).from(workspace).where(eq(workspace.id, ws.id));
    expect(received[0]!.headers["x-chefdonn-event"]).toBe("price_search.done");
    expect(verifySignature(secret!.s, received[0]!.body, received[0]!.headers["x-chefdonn-signature"] as string)).toBe(true);
    expect(JSON.parse(received[0]!.body)).toEqual(JSON.parse(JSON.stringify(serialisePriceSearch(found))));
  });

  it("the API alone never changes an estimate; a person applying it moves the locked line", async () => {
    const { ws, apiPrincipal, ownerPrincipal } = await setup();
    const [t] = await db.select().from(task).where(and(eq(task.workspaceId, ws.id), eq(task.templateKey, "ph.build.kitchen_equipment")));
    const before = t!.estimateCents;
    const created = expectOk(await search(apiPrincipal, { query: "chiller", subject: { type: "task", id: t!.id } }));
    await runPriceSearch(created.search.id);
    const [afterSearch] = await db.select().from(task).where(eq(task.id, t!.id));
    expect(afterSearch!.estimateCents).toBe(before);

    // API keys don't have prices.apply.
    expect(await runAction(apiPrincipal, "prices.apply", applyPriceInput, { priceSearchId: created.search.id }, applyPriceEstimate)).toMatchObject({ ok: false, status: 403 });

    const applied = expectOk(await runAction(ownerPrincipal, "prices.apply", applyPriceInput, { priceSearchId: created.search.id }, applyPriceEstimate));
    const [line] = await db.select().from(moneyLine).where(eq(moneyLine.sourceId, t!.id));
    expect(line!.plannedCents).toBe(applied.estimate);
    const [afterApply] = await db.select().from(task).where(eq(task.id, t!.id));
    expect(afterApply).toMatchObject({ estimateBasis: "price_search", estimatePriceSearchId: created.search.id });
  });

  it("is idempotent on clientId and enforces the daily limit", async () => {
    const { apiPrincipal } = await setup();
    const clientId = "0b9c8a4e-5f1d-4c8e-9b7a-1d2e3f4a5b6c";
    const a = expectOk(await search(apiPrincipal, { query: "LPG stove", clientId }));
    const b = expectOk(await search(apiPrincipal, { query: "LPG stove", clientId }));
    expect(b.search.id).toBe(a.search.id);
    expect(b.created).toBe(false);

    const limit = env.priceSearchDailyLimit;
    env.priceSearchDailyLimit = 2;
    expectOk(await search(apiPrincipal, { query: "second" }));
    expect(await search(apiPrincipal, { query: "third" })).toMatchObject({ ok: false, status: 429 });
    env.priceSearchDailyLimit = limit;
  });

  it("rejects unsafe callbacks when insecure callbacks aren't allowed", async () => {
    const { apiPrincipal } = await setup();
    env.allowInsecureCallbacks = false;
    try {
      for (const url of ["http://example.com/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://169.254.169.254/latest", "https://localhost/x"]) {
        expect(await search(apiPrincipal, { query: "fridge", callbackUrl: url })).toMatchObject({ ok: false, status: 422 });
      }
    } finally {
      env.allowInsecureCallbacks = true;
    }
  });

  it("retries a failing provider, then fails with a reason; the sweeper picks up queued work", async () => {
    const { ws, apiPrincipal } = await setup();
    const s = expectOk(await search(apiPrincipal, { query: "explode please" }));
    expect(await runPriceSearch(s.search.id)).toBe("retry");
    expect(await sweepPriceSearches()).toBeGreaterThanOrEqual(1);
    await sweepPriceSearches();
    const [row] = await db.select().from(priceSearch).where(eq(priceSearch.id, s.search.id));
    expect(row).toMatchObject({ status: "failed", attempts: 3 });
    expect(row!.error).toMatch(/fake provider failure/);
    expect(await db.select().from(priceObservation).where(eq(priceObservation.priceSearchId, s.search.id))).toHaveLength(0);
    void ws;
  });
});
