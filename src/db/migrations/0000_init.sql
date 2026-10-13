CREATE TYPE "public"."role" AS ENUM('owner', 'partner', 'helper', 'bookkeeper');--> statement-breakpoint
CREATE TYPE "public"."starting_point" AS ENUM('idea', 'found_place', 'building', 'about_to_open', 'open');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('normal', 'contingency', 'working_capital');--> statement-breakpoint
CREATE TYPE "public"."funding_type" AS ENUM('owner_equity', 'partner_equity', 'loan', 'investor', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank', 'gcash', 'maya', 'card', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('manual', 'task', 'receipt_unplanned', 'contingency_rule', 'contract', 'permit', 'equipment', 'location');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('receipt', 'photo', 'quote', 'other');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('uploaded', 'extracting', 'needs_review', 'extraction_failed', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."suggestion_source" AS ENUM('rule', 'ai', 'none');--> statement-breakpoint
CREATE TYPE "public"."estimate_basis" AS ENUM('owner', 'template_mid', 'price_search');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('plan', 'build', 'get_ready', 'run', 'improve');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'verified');--> statement-breakpoint
CREATE TYPE "public"."delivery_known" AS ENUM('yes', 'no', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."price_kind" AS ENUM('listed', 'quoted', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."price_search_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"subject_type" text,
	"subject_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "build_log_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"happened_on" date NOT NULL,
	"body" text NOT NULL,
	"cost_cents" bigint,
	"minutes" integer,
	"surprise" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_mutation" (
	"workspace_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"result_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_mutation_workspace_id_client_id_pk" PRIMARY KEY("workspace_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"phone" text,
	"messenger" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dev_mail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"url" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "restaurant_profile" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"concept" text,
	"municipality_code" text DEFAULT 'PH-PLW-SANVICENTE' NOT NULL,
	"municipality_name" text DEFAULT 'San Vicente, Palawan' NOT NULL,
	"barangay" text DEFAULT 'Port Barton' NOT NULL,
	"target_opening_date" date,
	"starting_point" "starting_point" DEFAULT 'idea' NOT NULL,
	"total_budget_cents" bigint,
	"contingency_bp" integer DEFAULT 1200 NOT NULL,
	"seats" integer,
	"onboarded_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"webhook_secret" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"hint" text,
	"kind" "category_kind" DEFAULT 'normal' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "funding_type" NOT NULL,
	"name" text NOT NULL,
	"committed_cents" bigint DEFAULT 0 NOT NULL,
	"expected_on" date,
	"notes" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funding_tranche" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"funding_source_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"received_on" date NOT NULL,
	"notes" text,
	"voided_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "money_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"description" text NOT NULL,
	"planned_cents" bigint DEFAULT 0 NOT NULL,
	"committed_cents" bigint DEFAULT 0 NOT NULL,
	"due_date" date,
	"payee_contact_id" uuid,
	"payee_name" text,
	"source_type" "source_type" DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"locked" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"money_line_id" uuid NOT NULL,
	"amount_cents" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"method" "payment_method" NOT NULL,
	"payee_name" text,
	"reference_no" text,
	"receipt_document_id" uuid,
	"gross_cents" bigint,
	"withholding_cents" bigint,
	"net_cents" bigint,
	"notes" text,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"original_name" text,
	"issue_date" date,
	"expiry_date" date,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"status" "receipt_status" DEFAULT 'uploaded' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claimed_at" timestamp with time zone,
	"extraction" jsonb,
	"draft" jsonb,
	"suggestion_source" "suggestion_source",
	"suggested_category_id" uuid,
	"suggested_money_line_id" uuid,
	"duplicate_signals" jsonb,
	"vendor_key" text,
	"doc_number" text,
	"total_cents" bigint,
	"receipt_date" date,
	"payment_id" uuid,
	"captured_by" text,
	"confirmed_by" text,
	"confirmed_at" timestamp with time zone,
	"rejected_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_line_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"description" text NOT NULL,
	"qty_milli" integer,
	"unit_cents" bigint,
	"amount_cents" bigint
);
--> statement-breakpoint
CREATE TABLE "vendor_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"vendor_key" text NOT NULL,
	"vendor_name" text,
	"category_id" uuid NOT NULL,
	"money_line_id" uuid,
	"hits" integer DEFAULT 1 NOT NULL,
	"last_receipt_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"template_key" text,
	"stage" "stage" NOT NULL,
	"area" text NOT NULL,
	"sort" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"owner_user_id" text,
	"due_date" date,
	"cost_min_cents" bigint,
	"cost_max_cents" bigint,
	"category_key" text,
	"estimate_cents" bigint,
	"estimate_basis" "estimate_basis",
	"estimate_price_search_id" uuid,
	"verification" "verification_status" DEFAULT 'unverified' NOT NULL,
	"source" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependency" (
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	CONSTRAINT "task_dependency_task_id_depends_on_task_id_pk" PRIMARY KEY("task_id","depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "task_template" (
	"key" text PRIMARY KEY NOT NULL,
	"set_version" text NOT NULL,
	"municipality_code" text,
	"stage" "stage" NOT NULL,
	"area" text NOT NULL,
	"sort" integer NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"depends_on" text[] DEFAULT '{}' NOT NULL,
	"cost_min_cents" bigint,
	"cost_max_cents" bigint,
	"typical_days" integer,
	"category_key" text,
	"verification" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verified_by" text,
	"verified_on" date,
	"source" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_observation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"price_search_id" uuid NOT NULL,
	"item" text NOT NULL,
	"vendor" text,
	"unit_price_cents" bigint NOT NULL,
	"unit" text,
	"price_kind" "price_kind" NOT NULL,
	"seller_location" text,
	"includes_delivery_to_palawan" "delivery_known" DEFAULT 'unknown' NOT NULL,
	"source_url" text NOT NULL,
	"source_title" text,
	"seen_on" date,
	"confidence" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_search" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"query" text NOT NULL,
	"context" jsonb NOT NULL,
	"subject_type" text DEFAULT 'none' NOT NULL,
	"subject_id" uuid,
	"status" "price_search_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"claimed_at" timestamp with time zone,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"requested_via" text NOT NULL,
	"requested_by_user_id" text,
	"requested_by_api_key_id" uuid,
	"client_id" uuid,
	"callback_url" text,
	"callback_status" text,
	"callback_attempts" integer DEFAULT 0 NOT NULL,
	"summary" jsonb,
	"raw_transcript" jsonb,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_log_entry" ADD CONSTRAINT "build_log_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "build_log_entry" ADD CONSTRAINT "build_log_entry_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_mutation" ADD CONSTRAINT "client_mutation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact" ADD CONSTRAINT "contact_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_profile" ADD CONSTRAINT "restaurant_profile_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_category" ADD CONSTRAINT "budget_category_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_source" ADD CONSTRAINT "funding_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_tranche" ADD CONSTRAINT "funding_tranche_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_tranche" ADD CONSTRAINT "funding_tranche_funding_source_id_funding_source_id_fk" FOREIGN KEY ("funding_source_id") REFERENCES "public"."funding_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_tranche" ADD CONSTRAINT "funding_tranche_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_line" ADD CONSTRAINT "money_line_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_line" ADD CONSTRAINT "money_line_category_id_budget_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_line" ADD CONSTRAINT "money_line_payee_contact_id_contact_id_fk" FOREIGN KEY ("payee_contact_id") REFERENCES "public"."contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_line" ADD CONSTRAINT "money_line_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_money_line_id_money_line_id_fk" FOREIGN KEY ("money_line_id") REFERENCES "public"."money_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_link" ADD CONSTRAINT "document_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_link" ADD CONSTRAINT "document_link_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_document_id_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."document"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_suggested_category_id_budget_category_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."budget_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_suggested_money_line_id_money_line_id_fk" FOREIGN KEY ("suggested_money_line_id") REFERENCES "public"."money_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_captured_by_user_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_line_item" ADD CONSTRAINT "receipt_line_item_receipt_id_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rule" ADD CONSTRAINT "vendor_rule_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rule" ADD CONSTRAINT "vendor_rule_category_id_budget_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_rule" ADD CONSTRAINT "vendor_rule_money_line_id_money_line_id_fk" FOREIGN KEY ("money_line_id") REFERENCES "public"."money_line"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependency" ADD CONSTRAINT "task_dependency_depends_on_task_id_task_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observation" ADD CONSTRAINT "price_observation_price_search_id_price_search_id_fk" FOREIGN KEY ("price_search_id") REFERENCES "public"."price_search"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_search" ADD CONSTRAINT "price_search_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_search" ADD CONSTRAINT "price_search_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_search" ADD CONSTRAINT "price_search_requested_by_api_key_id_api_key_id_fk" FOREIGN KEY ("requested_by_api_key_id") REFERENCES "public"."api_key"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_ws_at_idx" ON "audit_event" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "build_log_subject_idx" ON "build_log_entry" USING btree ("workspace_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "membership_ws_user_uq" ON "membership" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "membership_user_idx" ON "membership" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_category_ws_key_uq" ON "budget_category" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "money_line_ws_idx" ON "money_line" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "money_line_source_uq" ON "money_line" USING btree ("workspace_id","source_type","source_id") WHERE "money_line"."source_id" is not null and "money_line"."voided_at" is null;--> statement-breakpoint
CREATE INDEX "payment_ws_idx" ON "payment" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "payment_line_idx" ON "payment" USING btree ("money_line_id");--> statement-breakpoint
CREATE INDEX "document_ws_sha_idx" ON "document" USING btree ("workspace_id","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "document_link_uq" ON "document_link" USING btree ("document_id","subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "receipt_ws_status_idx" ON "receipt" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "receipt_ws_vendor_idx" ON "receipt" USING btree ("workspace_id","vendor_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vendor_rule_ws_key_uq" ON "vendor_rule" USING btree ("workspace_id","vendor_key");--> statement-breakpoint
CREATE INDEX "task_ws_idx" ON "task" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_ws_template_uq" ON "task" USING btree ("workspace_id","template_key");--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_uq" ON "api_key" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "price_observation_search_idx" ON "price_observation" USING btree ("price_search_id");--> statement-breakpoint
CREATE INDEX "price_search_ws_created_idx" ON "price_search" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "price_search_subject_idx" ON "price_search" USING btree ("workspace_id","subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_search_client_uq" ON "price_search" USING btree ("workspace_id","client_id");