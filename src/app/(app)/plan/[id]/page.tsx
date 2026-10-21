import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db/client";
import { formatDate, manilaToday } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { discardPlanAction, retryPlanAction } from "@/server/actions/plan";
import { getPlanDraft, liveItems } from "@/server/services/ai-plan";
import { budgetOverview } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ActionForm, Submit } from "@/ui/form";
import { ButtonLink, Card, Notice, PageHeader, SectionTitle, StatusBadge } from "@/ui/kit";
import { PollRefresh } from "@/ui/poll-refresh";
import { PlanReview } from "./plan-review";

export const metadata: Metadata = { title: "AI budget draft" };

export default async function PlanDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireMember();
  const role = v.principal.actor.role;
  if (!can(role, "plan.draft")) redirect("/budget");
  const ws = v.principal.workspaceId;
  const d = await getPlanDraft(db, ws, id);
  if (!d) notFound();
  const header = <PageHeader title="Your AI budget draft" back={{ href: "/budget", label: "Budget" }} />;

  if (d.status === "queued" || d.status === "running") {
    return (
      <div className="flex flex-col gap-4">
        <PollRefresh maxMs={600_000} />
        {header}
        <Card strong>
          <StatusBadge tone="reading" label="Drafting" />
          <p className="mt-2 text-[18px] font-semibold">Claude is drafting your budget…</p>
          <p className="mt-1 text-muted">Usually under a minute. You can leave — the draft waits here, and nothing on your budget changes until you apply it.</p>
        </Card>
        {d.lastError && <Notice tone="warning" title="First try didn't work — trying again.">{d.lastError}</Notice>}
      </div>
    );
  }

  if (d.status === "failed") {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="danger" title="The draft didn't work">
          {d.lastError}
        </Notice>
        <ActionForm action={retryPlanAction}>
          <input type="hidden" name="draftId" value={d.id} />
          <Submit pendingLabel="Starting…">Try again</Submit>
        </ActionForm>
        <ButtonLink href="/budget" variant="secondary">
          Change amounts by hand instead
        </ButtonLink>
      </div>
    );
  }

  if (d.status === "discarded" || d.status === "applied") {
    return (
      <div className="flex flex-col gap-4">
        {header}
        {d.status === "applied" ? (
          <Notice tone="success" title={`Applied ${d.appliedItems?.length ?? 0} changes${d.appliedAt ? ` on ${formatDate(manilaToday(d.appliedAt))}` : ""}.`}>
            They&rsquo;re marked &ldquo;AI estimate&rdquo; on the budget until you change them or look up prices.
          </Notice>
        ) : (
          <Notice title="This draft was discarded." />
        )}
        <div className="grid grid-cols-2 gap-2">
          <ButtonLink href="/budget" variant="secondary">
            Budget
          </ButtonLink>
          <ButtonLink href="/plan/new" variant="secondary">
            Redo the AI setup
          </ButtonLink>
        </div>
      </div>
    );
  }

  // ready
  const o = await budgetOverview(db, ws, manilaToday(new Date()));
  const items = await liveItems(db, ws, d.proposal?.items ?? []);
  const catName = new Map(o.inputs.cats.map((c) => [c.id, c.name]));
  const p = d.proposal!;
  return (
    <div className="flex flex-col gap-4">
      {header}
      <Card>
        <StatusBadge tone="ai_estimate" label="AI estimates — check before applying" />
        {p.summary && <p className="mt-2">{p.summary}</p>}
        {p.assumptions.length > 0 && (
          <>
            <SectionTitle>Claude assumed</SectionTitle>
            <ul className="ml-5 list-disc text-[15px]">
              {p.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
        {p.check.length > 0 && (
          <>
            <SectionTitle>Check these</SectionTitle>
            <ul className="ml-5 list-disc text-[15px]">
              {p.check.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
      {items.length === 0 ? (
        <Notice tone="success" title="Nothing to change — your budget already matches this draft." />
      ) : (
        <PlanReview
          draftId={d.id}
          items={items.map((i) => ({ ...i, categoryName: (i.categoryId && catName.get(i.categoryId)) || "Other" }))}
          categories={o.inputs.categories}
          lines={o.inputs.lineInputs}
          totalBudgetCents={o.profile.totalBudgetCents}
          contingencyBp={o.profile.contingencyBp}
        />
      )}
      <ActionForm action={discardPlanAction}>
        <input type="hidden" name="draftId" value={d.id} />
        <Submit variant="ghost" pendingLabel="Discarding…">
          Discard this draft
        </Submit>
      </ActionForm>
    </div>
  );
}
