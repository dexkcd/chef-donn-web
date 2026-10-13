/** Workspace, people, profile, and the shared primitives every module uses. */
import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { ROLES } from "../../domain/permissions";
import { STARTING_POINTS } from "../../domain/roadmap";
import { user } from "./auth";
import { cents, createdAt, localDate, pk, tstz, updatedAt } from "./columns";

export const roleEnum = pgEnum("role", ROLES);
export const startingPointEnum = pgEnum("starting_point", STARTING_POINTS);

export const workspace = pgTable("workspace", {
  id: pk(),
  name: text("name").notNull(),
  /** HMAC key for signing outbound webhooks (price-search callbacks). Rotatable. */
  webhookSecret: text("webhook_secret").notNull(),
  createdAt: createdAt(),
});

export const membership = pgTable(
  "membership",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_ws_user_uq").on(t.workspaceId, t.userId), index("membership_user_idx").on(t.userId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    invitedBy: text("invited_by").references(() => user.id),
    expiresAt: tstz("expires_at").notNull(),
    acceptedAt: tstz("accepted_at"),
    revokedAt: tstz("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("invitation_email_idx").on(sql`lower(${t.email})`)],
);

export const restaurantProfile = pgTable("restaurant_profile", {
  workspaceId: uuid("workspace_id")
    .primaryKey()
    .references(() => workspace.id),
  name: text("name").notNull(),
  concept: text("concept"),
  municipalityCode: text("municipality_code").notNull().default("PH-PLW-SANVICENTE"),
  municipalityName: text("municipality_name").notNull().default("San Vicente, Palawan"),
  barangay: text("barangay").notNull().default("Port Barton"),
  targetOpeningDate: localDate("target_opening_date"),
  startingPoint: startingPointEnum("starting_point").notNull().default("idea"),
  totalBudgetCents: cents("total_budget_cents"),
  contingencyBp: integer("contingency_bp").notNull().default(1200),
  seats: integer("seats"),
  onboardedAt: tstz("onboarded_at"),
  updatedAt: updatedAt(),
});

export const contact = pgTable("contact", {
  id: pk(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspace.id),
  name: text("name").notNull(),
  role: text("role"),
  phone: text("phone"),
  messenger: text("messenger"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const buildLogEntry = pgTable(
  "build_log_entry",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    happenedOn: localDate("happened_on").notNull(),
    body: text("body").notNull(),
    costCents: cents("cost_cents"),
    minutes: integer("minutes"),
    surprise: text("surprise"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("build_log_subject_idx").on(t.workspaceId, t.subjectType, t.subjectId)],
);

/** Append-only record of every write: who (user, API key or system), what, before/after. */
export const auditEvent = pgTable(
  "audit_event",
  {
    id: pk(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    actorType: text("actor_type", { enum: ["user", "api_key", "system"] }).notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    subjectType: text("subject_type"),
    subjectId: text("subject_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    at: createdAt(),
  },
  (t) => [index("audit_ws_at_idx").on(t.workspaceId, t.at)],
);

/** Offline replays dedupe here — the web version of the Android hub's commandId check. */
export const clientMutation = pgTable(
  "client_mutation",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspace.id),
    clientId: uuid("client_id").notNull(),
    kind: text("kind").notNull(),
    resultRef: text("result_ref"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.clientId] })],
);

/** Dev/test only: magic-link emails land here instead of being sent. */
export const devMail = pgTable("dev_mail", {
  id: pk(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  url: text("url"),
  body: text("body").notNull(),
  createdAt: createdAt(),
});
