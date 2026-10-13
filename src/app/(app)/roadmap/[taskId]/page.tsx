import { and, eq } from "drizzle-orm";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { moneyLine, task } from "@/db/schema";
import { formatPeso } from "@/domain/money";
import { can } from "@/domain/permissions";
import { STAGE_LABELS } from "@/domain/roadmap";
import { setTaskEstimateAction, setTaskStatusAction } from "@/server/actions/roadmap";
import { loadCategories, loadProfile } from "@/server/services/budget-data";
import { loadRoadmap } from "@/server/services/roadmap";
import { requireMember } from "@/server/viewer";
import { ActionForm, MoneyField, SelectField, Submit } from "@/ui/form";
import { Card, KeyValue, Notice, PageHeader, SectionTitle, StatusBadge } from "@/ui/kit";
import { PriceSearchPanel } from "@/ui/price-search-panel";
import { toneFor } from "@/ui/task-tone";

export const metadata: Metadata = { title: "Task" };

const STATUS_BUTTONS = [
  { status: "in_progress", label: "▲ Started" },
  { status: "done", label: "✓ Done" },
  { status: "skipped", label: "— Doesn't apply" },
  { status: "todo", label: "○ Not started" },
] as const;

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const v = await requireMember();
  const ws = v.principal.workspaceId;
  const role = v.principal.actor.role;
  const [t] = await db
    .select()
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.workspaceId, ws)));
  if (!t) notFound();
  const profile = await loadProfile(db, ws);
  const { view } = await loadRoadmap(db, ws, profile.startingPoint);
  const tv = [...view.catchUp, ...view.now, ...view.later].find((x) => x.task.id === t.id)!;
  const [line] = await db
    .select()
    .from(moneyLine)
    .where(and(eq(moneyLine.workspaceId, ws), eq(moneyLine.sourceType, "task"), eq(moneyLine.sourceId, t.id)));
  const cats = (await loadCategories(db, ws)).filter((c) => c.kind === "normal" || c.kind === "working_capital");

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t.title}
        back={{ href: "/roadmap", label: "Roadmap" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={toneFor(tv)} />
            <StatusBadge tone={t.verification === "verified" ? "verified" : "unverified"} />
            <span className="label text-[13px] text-muted">
              {STAGE_LABELS[t.stage]} · {t.area}
            </span>
          </span>
        }
      />

      <Card>
        <p className="text-[17px] leading-relaxed">{t.body}</p>
        {t.source && <p className="mt-3 text-[14px] text-muted">Source: {t.source}</p>}
      </Card>

      {tv.state.kind === "blocked" && (
        <Notice tone="warning" title="Waiting on">
          <ul className="mt-1">
            {tv.state.by.map((b) => (
              <li key={b.id}>
                <Link className="font-semibold text-green underline" href={`/roadmap/${b.id}` as Route}>
                  {b.title}
                </Link>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {can(role, "task.set_status") && (
        <Card>
          <SectionTitle>Update status</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_BUTTONS.filter((b) => b.status !== t.status).map((b) => (
              <ActionForm key={b.status} action={setTaskStatusAction} className="!gap-1">
                <input type="hidden" name="taskId" value={t.id} />
                <input type="hidden" name="status" value={b.status} />
                <Submit variant={b.status === "done" ? "primary" : "secondary"} pendingLabel="…">
                  {b.label}
                </Submit>
              </ActionForm>
            ))}
          </div>
          {t.status !== "skipped" && t.estimateCents ? (
            <p className="mt-2 text-[14px] text-muted">Marking it “doesn&rsquo;t apply” sets its planned cost to ₱0.</p>
          ) : null}
        </Card>
      )}

      <Card>
        <SectionTitle>Cost</SectionTitle>
        <KeyValue
          items={[
            {
              k: "Estimate",
              v: t.estimateCents !== null ? <span className="num font-semibold">{formatPeso(t.estimateCents, { noCentavos: true })}</span> : <span className="text-muted">None</span>,
            },
            ...(t.costMinCents !== null && t.costMaxCents !== null
              ? [{ k: "Typical range", v: <span className="num">{`${formatPeso(t.costMinCents, { noCentavos: true })} – ${formatPeso(t.costMaxCents, { noCentavos: true })}`}</span> }]
              : []),
            {
              k: "Based on",
              v:
                t.estimateBasis === "template_mid" ? (
                  <StatusBadge tone="estimate" />
                ) : t.estimateBasis === "price_search" ? (
                  <StatusBadge tone="found_online" label="Prices found online" />
                ) : t.estimateBasis === "owner" ? (
                  "Your number"
                ) : (
                  "—"
                ),
            },
            ...(line ? [{ k: "Budget line", v: <Link className="font-semibold text-green underline" href={`/budget/lines/${line.id}` as Route}>Open line ›</Link> }] : []),
          ]}
        />
        {can(role, "task.edit") && (
          <ActionForm action={setTaskEstimateAction} className="mt-4">
            <input type="hidden" name="taskId" value={t.id} />
            <MoneyField name="estimate" label="Your estimate" defaultCents={t.estimateCents} hint="A quote, what a friend paid, or your best guess. The budget line follows it." />
            {!t.categoryKey && (
              <SelectField name="categoryKey" label="Budget category" defaultValue="">
                <option value="" disabled>
                  Pick a category
                </option>
                {cats.map((c) => (
                  <option key={c.id} value={c.key}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            )}
            <Submit variant="secondary">Save estimate</Submit>
          </ActionForm>
        )}
      </Card>

      {can(role, "prices.search") && t.status !== "skipped" && (
        <PriceSearchPanel subject={{ type: "task", id: t.id }} defaultQuery={t.title} canApply={can(role, "prices.apply") && can(role, "task.edit")} needsCategory={!t.categoryKey} />
      )}
    </div>
  );
}
