/** The price-search hook: searches (triggered from the app or the API), observations, API keys. */
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { PriceSummary } from "../../domain/prices";
import type { PriceSearchContext } from "../../lib/ai/price-search/types";
import { user } from "./auth";
import { cents, createdAt, localDate, pk, tstz, updatedAt } from "./columns";
import { workspace } from "./core";

export const priceSearchStatusEnum = pgEnum("price_search_status", ["queued", "running", "done", "failed"]);
export const priceKindEnum = pgEnum("price_kind", ["listed", "quoted", "delivered"]);
export const deliveryKnownEnum = pgEnum("delivery_known", ["yes", "no", "unknown"]);

export const API_KEY_SCOPES = ["prices:search", "prices:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const apiKey = pgTable(
  "api_key",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    name: text("name").notNull(),
    /** First characters of the key, shown in the UI ("cdk_7f3a1b…"). */
    prefix: text("prefix").notNull(),
    /** sha256 of the full key. The key itself is shown once and never stored. */
    secretHash: text("secret_hash").notNull(),
    scopes: text("scopes").array().$type<ApiKeyScope[]>().notNull(),
    createdBy: text("created_by").references(() => user.id),
    lastUsedAt: tstz("last_used_at"),
    revokedAt: tstz("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_key_hash_uq").on(t.secretHash)],
);

export const priceSearch = pgTable(
  "price_search",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    query: text("query").notNull(),
    context: jsonb("context").$type<PriceSearchContext>().notNull(),
    subjectType: text("subject_type", { enum: ["task", "money_line", "none"] }).notNull().default("none"),
    subjectId: uuid("subject_id"),
    status: priceSearchStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    claimedAt: tstz("claimed_at"),
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    requestedVia: text("requested_via", { enum: ["app", "api"] }).notNull(),
    requestedByUserId: text("requested_by_user_id").references(() => user.id),
    requestedByApiKeyId: uuid("requested_by_api_key_id").references(() => apiKey.id),
    clientId: uuid("client_id"),
    callbackUrl: text("callback_url"),
    callbackStatus: text("callback_status", { enum: ["pending", "delivered", "failed"] }),
    callbackAttempts: integer("callback_attempts").notNull().default(0),
    summary: jsonb("summary").$type<PriceSummary>(),
    rawTranscript: jsonb("raw_transcript"),
    completedAt: tstz("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("price_search_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("price_search_subject_idx").on(t.workspaceId, t.subjectType, t.subjectId),
    uniqueIndex("price_search_client_uq").on(t.workspaceId, t.clientId),
  ],
);

export const priceObservation = pgTable(
  "price_observation",
  {
    id: pk(),
    priceSearchId: uuid("price_search_id")
      .notNull()
      .references(() => priceSearch.id, { onDelete: "cascade" }),
    item: text("item").notNull(),
    vendor: text("vendor"),
    unitPriceCents: cents("unit_price_cents").notNull(),
    unit: text("unit"),
    priceKind: priceKindEnum("price_kind").notNull(),
    sellerLocation: text("seller_location"),
    includesDeliveryToPalawan: deliveryKnownEnum("includes_delivery_to_palawan").notNull().default("unknown"),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title"),
    seenOn: localDate("seen_on"),
    confidence: text("confidence", { enum: ["high", "medium", "low"] }).notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("price_observation_search_idx").on(t.priceSearchId)],
);
