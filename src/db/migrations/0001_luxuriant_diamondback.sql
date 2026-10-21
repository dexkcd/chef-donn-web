CREATE TYPE "public"."plan_draft_status" AS ENUM('queued', 'running', 'ready', 'failed', 'applied', 'discarded');--> statement-breakpoint
ALTER TYPE "public"."source_type" ADD VALUE 'ai_plan' BEFORE 'contract';--> statement-breakpoint
ALTER TYPE "public"."estimate_basis" ADD VALUE 'ai_plan';--> statement-breakpoint
CREATE TABLE "plan_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" "plan_draft_status" DEFAULT 'queued' NOT NULL,
	"answers" jsonb NOT NULL,
	"proposal" jsonb,
	"raw" jsonb,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claimed_at" timestamp with time zone,
	"requested_by" text,
	"applied_by" text,
	"applied_items" jsonb,
	"applied_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_draft" ADD CONSTRAINT "plan_draft_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_draft" ADD CONSTRAINT "plan_draft_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_draft" ADD CONSTRAINT "plan_draft_applied_by_user_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_draft_ws_created_idx" ON "plan_draft" USING btree ("workspace_id","created_at");