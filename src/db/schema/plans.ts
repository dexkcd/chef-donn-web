/** AI-drafted budget plans: the owner's answers, Claude's proposal, and whether it was applied. */
import { index, integer, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { PlanAnswers, PlanProposal } from "../../domain/plan";
import { user } from "./auth";
import { createdAt, pk, tstz, updatedAt } from "./columns";
import { workspace } from "./core";

export const planDraftStatusEnum = pgEnum("plan_draft_status", ["queued", "running", "ready", "failed", "applied", "discarded"]);

export const planDraft = pgTable(
  "plan_draft",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    status: planDraftStatusEnum("status").notNull().default("queued"),
    answers: jsonb("answers").$type<PlanAnswers>().notNull(),
    /** Written once when the draft is ready; a person applies items from it. */
    proposal: jsonb("proposal").$type<PlanProposal>(),
    raw: jsonb("raw"),
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    claimedAt: tstz("claimed_at"),
    requestedBy: text("requested_by").references(() => user.id),
    appliedBy: text("applied_by").references(() => user.id),
    appliedItems: jsonb("applied_items").$type<string[]>(),
    appliedAt: tstz("applied_at"),
    completedAt: tstz("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("plan_draft_ws_created_idx").on(t.workspaceId, t.createdAt)],
);
