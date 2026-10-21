/** Roadmap: shared task templates (local rules as data) and this restaurant's tasks. */
import { index, integer, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { STAGES } from "../../domain/roadmap";
import { user } from "./auth";
import { cents, createdAt, localDate, pk, tstz, updatedAt } from "./columns";
import { workspace } from "./core";

export const stageEnum = pgEnum("stage", STAGES);
export const taskStatusEnum = pgEnum("task_status", ["todo", "in_progress", "done", "skipped"]);
export const verificationEnum = pgEnum("verification_status", ["unverified", "verified"]);
export const estimateBasisEnum = pgEnum("estimate_basis", ["owner", "template_mid", "price_search", "ai_plan"]);

/**
 * Templates are shared knowledge, not per workspace. Every local rule carries who verified
 * it, when, and the source — never invented by the AI.
 */
export const taskTemplate = pgTable("task_template", {
  key: text("key").primaryKey(),
  setVersion: text("set_version").notNull(),
  municipalityCode: text("municipality_code"),
  stage: stageEnum("stage").notNull(),
  area: text("area").notNull(),
  sort: integer("sort").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  dependsOn: text("depends_on").array().notNull().default([]),
  costMinCents: cents("cost_min_cents"),
  costMaxCents: cents("cost_max_cents"),
  typicalDays: integer("typical_days"),
  categoryKey: text("category_key"),
  verification: verificationEnum("verification").notNull().default("unverified"),
  verifiedBy: text("verified_by"),
  verifiedOn: localDate("verified_on"),
  source: text("source"),
  updatedAt: updatedAt(),
});

/** A task copies its template at onboarding (like LineSpec snapshots on Android). */
export const task = pgTable(
  "task",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    templateKey: text("template_key"),
    stage: stageEnum("stage").notNull(),
    area: text("area").notNull(),
    sort: integer("sort").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: taskStatusEnum("status").notNull().default("todo"),
    ownerUserId: text("owner_user_id").references(() => user.id),
    dueDate: localDate("due_date"),
    costMinCents: cents("cost_min_cents"),
    costMaxCents: cents("cost_max_cents"),
    categoryKey: text("category_key"),
    estimateCents: cents("estimate_cents"),
    estimateBasis: estimateBasisEnum("estimate_basis"),
    estimatePriceSearchId: uuid("estimate_price_search_id"),
    verification: verificationEnum("verification").notNull().default("unverified"),
    source: text("source"),
    completedAt: tstz("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("task_ws_idx").on(t.workspaceId), uniqueIndex("task_ws_template_uq").on(t.workspaceId, t.templateKey)],
);

export const taskDependency = pgTable(
  "task_dependency",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
    dependsOnTaskId: uuid("depends_on_task_id")
      .notNull()
      .references(() => task.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnTaskId] })],
);
