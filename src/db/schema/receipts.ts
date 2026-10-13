/** Documents (files), receipts and what the AI read from them, learned vendor rules. */
import { index, integer, jsonb, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { DuplicateSignal } from "../../domain/duplicates";
import type { ReceiptDraft, ReceiptExtraction } from "../../lib/ai/receipt-types";
import { user } from "./auth";
import { budgetCategory, moneyLine, payment } from "./budget";
import { cents, createdAt, localDate, pk, tstz, updatedAt } from "./columns";
import { workspace } from "./core";

export const documentKindEnum = pgEnum("document_kind", ["receipt", "photo", "quote", "other"]);
export const receiptStatusEnum = pgEnum("receipt_status", [
  "uploaded",
  "extracting",
  "needs_review",
  "extraction_failed",
  "confirmed",
  "rejected",
]);
export const suggestionSourceEnum = pgEnum("suggestion_source", ["rule", "ai", "none"]);

export const document = pgTable(
  "document",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    kind: documentKindEnum("kind").notNull(),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    originalName: text("original_name"),
    issueDate: localDate("issue_date"),
    expiryDate: localDate("expiry_date"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("document_ws_sha_idx").on(t.workspaceId, t.sha256)],
);

/** One document can back many records (a receipt, a payment, later a permit). */
export const documentLink = pgTable(
  "document_link",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("document_link_uq").on(t.documentId, t.subjectType, t.subjectId)],
);

export const receipt = pgTable(
  "receipt",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id),
    status: receiptStatusEnum("status").notNull().default("uploaded"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    claimedAt: tstz("claimed_at"),
    /** What the extractor returned, exactly. Written once. */
    extraction: jsonb("extraction").$type<ReceiptExtraction>(),
    /** The review form: every field {value, confidence, confirmed}. */
    draft: jsonb("draft").$type<ReceiptDraft>(),
    suggestionSource: suggestionSourceEnum("suggestion_source"),
    suggestedCategoryId: uuid("suggested_category_id").references(() => budgetCategory.id),
    suggestedMoneyLineId: uuid("suggested_money_line_id").references(() => moneyLine.id),
    duplicateSignals: jsonb("duplicate_signals").$type<DuplicateSignal[]>(),
    /** Fingerprint for duplicate checks, filled from the draft. */
    vendorKey: text("vendor_key"),
    docNumber: text("doc_number"),
    totalCents: cents("total_cents"),
    receiptDate: localDate("receipt_date"),
    paymentId: uuid("payment_id").references(() => payment.id),
    capturedBy: text("captured_by").references(() => user.id),
    confirmedBy: text("confirmed_by").references(() => user.id),
    confirmedAt: tstz("confirmed_at"),
    rejectedReason: text("rejected_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("receipt_ws_status_idx").on(t.workspaceId, t.status), index("receipt_ws_vendor_idx").on(t.workspaceId, t.vendorKey)],
);

export const receiptLineItem = pgTable("receipt_line_item", {
  id: pk(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => receipt.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  description: text("description").notNull(),
  qtyMilli: integer("qty_milli"),
  unitCents: cents("unit_cents"),
  amountCents: cents("amount_cents"),
});

/** Learned from confirmations: "last time you filed this vendor under …". */
export const vendorRule = pgTable(
  "vendor_rule",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    vendorKey: text("vendor_key").notNull(),
    vendorName: text("vendor_name"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => budgetCategory.id),
    moneyLineId: uuid("money_line_id").references(() => moneyLine.id),
    hits: integer("hits").notNull().default(1),
    lastReceiptId: uuid("last_receipt_id"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("vendor_rule_ws_key_uq").on(t.workspaceId, t.vendorKey)],
);
