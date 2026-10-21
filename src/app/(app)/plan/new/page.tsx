import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { formatBp, formatPeso } from "@/domain/money";
import { can } from "@/domain/permissions";
import { EMPTY_ANSWERS } from "@/domain/plan";
import { planDraftingOn } from "@/lib/ai/plan";
import { requestPlanAction } from "@/server/actions/plan";
import { lastPlanAnswers } from "@/server/services/ai-plan";
import { loadProfile } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ActionForm, Submit } from "@/ui/form";
import { Notice, PageHeader } from "@/ui/kit";
import { PlanQuestions } from "@/ui/plan-questions";

export const metadata: Metadata = { title: "Redo the AI setup" };

export default async function NewPlanPage() {
  const v = await requireMember();
  if (!can(v.principal.actor.role, "plan.draft")) redirect("/budget");
  const ws = v.principal.workspaceId;
  const [profile, last] = await Promise.all([loadProfile(db, ws), lastPlanAnswers(db, ws)]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Redo the AI setup" back={{ href: "/budget", label: "Budget" }} subtitle="Change what's changed. Claude redrafts the budget and shows you the differences — nothing changes until you apply them." />
      {!planDraftingOn() ? (
        <Notice tone="warning" title="AI drafting is off">
          Set ANTHROPIC_API_KEY on the server to turn it on. You can still change amounts on each category page.
        </Notice>
      ) : (
        <ActionForm action={requestPlanAction}>
          <p className="text-[15px] text-muted">
            Total you can spend <span className="num">{profile.totalBudgetCents === null ? "not set" : formatPeso(profile.totalBudgetCents, { noCentavos: true })}</span>, contingency{" "}
            <span className="num">{formatBp(profile.contingencyBp)}</span> — change these in{" "}
            <Link className="font-semibold text-green underline" href="/settings/profile">
              Profile
            </Link>
            .
          </p>
          <PlanQuestions defaults={last ?? { ...EMPTY_ANSWERS, seats: profile.seats }} />
          <Submit pendingLabel="Starting…">Draft with Claude</Submit>
        </ActionForm>
      )}
    </div>
  );
}
