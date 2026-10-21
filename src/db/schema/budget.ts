/** Opening budget: categories, money lines (planned/committed), payments (paid), funding. */
import { sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { cents, createdAt, localDate, pk, tstz, updatedAt } from "./columns";
import { contact, workspace } from "./core";

export const categoryKindEnum = pgEnum("category_kind", ["normal", "contingency", "working_capital"]);
export const sourceTypeEnum = pgEnum("source_type", [
  "manual",
  "task",
  "receipt_unplanned",
  "contingency_rule",
  "ai_plan",
  "contract",
  "permit",
  "equipment",
  "location",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "bank", "gcash", "maya", "card", "other"]);
export const fundingTypeEnum = pgEnum("funding_type", ["owner_equity", "partner_equity", "loan", "investor", "other"]);

export const budgetCategory = pgTable(
  "budget_category",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    hint: text("hint"),
    kind: categoryKindEnum("kind").notNull().default("normal"),
    sort: integer("sort").notNull().default(0),
    archivedAt: tstz("archived_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("budget_category_ws_key_uq").on(t.workspaceId, t.key)],
);

export const moneyLine = pgTable(
  "money_line",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => budgetCategory.id),
    description: text("description").notNull(),
    plannedCents: cents("planned_cents").notNull().default(0),
    committedCents: cents("committed_cents").notNull().default(0),
    dueDate: localDate("due_date"),
    payeeContactId: uuid("payee_contact_id").references(() => contact.id),
    payeeName: text("payee_name"),
    sourceType: sourceTypeEnum("source_type").notNull().default("manual"),
    sourceId: uuid("source_id"),
    /** Locked lines follow their source record: edit the task (later: contract, quote, permit). */
    locked: boolean("locked").notNull().default(false),
    closedAt: tstz("closed_at"),
    voidedAt: tstz("voided_at"),
    voidReason: text("void_reason"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("money_line_ws_idx").on(t.workspaceId),
    uniqueIndex("money_line_source_uq")
      .on(t.workspaceId, t.sourceType, t.sourceId)
      .where(sql`${t.sourceId} is not null and ${t.voidedAt} is null`),
  ],
);

export const payment = pgTable(
  "payment",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    moneyLineId: uuid("money_line_id")
      .notNull()
      .references(() => moneyLine.id),
    amountCents: cents("amount_cents").notNull(),
    paidOn: localDate("paid_on").notNull(),
    method: paymentMethodEnum("method").notNull(),
    payeeName: text("payee_name"),
    referenceNo: text("reference_no"),
    receiptDocumentId: uuid("receipt_document_id"),
    /** Rent: gross, 5% creditable withholding, net actually paid (v1 records, never files). */
    grossCents: cents("gross_cents"),
    withholdingCents: cents("withholding_cents"),
    netCents: cents("net_cents"),
    notes: text("notes"),
    voidedAt: tstz("voided_at"),
    voidReason: text("void_reason"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("payment_ws_idx").on(t.workspaceId), index("payment_line_idx").on(t.moneyLineId)],
);

export const fundingSource = pgTable("funding_source", {
  id: pk(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  type: fundingTypeEnum("type").notNull(),
  name: text("name").notNull(),
  committedCents: cents("committed_cents").notNull().default(0),
  expectedOn: localDate("expected_on"),
  notes: text("notes"),
  archivedAt: tstz("archived_at"),
  createdAt: createdAt(),
});

/** Money that actually arrived from a funding source. */
export const fundingTranche = pgTable("funding_tranche", {
  id: pk(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  fundingSourceId: uuid("funding_source_id")
    .notNull()
    .references(() => fundingSource.id),
  amountCents: cents("amount_cents").notNull(),
  receivedOn: localDate("received_on").notNull(),
  notes: text("notes"),
  voidedAt: tstz("voided_at"),
  createdBy: text("created_by").references(() => user.id),
  createdAt: createdAt(),
});
