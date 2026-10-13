import type { Metadata, Route } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { STAGE_LABELS, STARTING_POINT_LABELS, type TaskView } from "@/domain/roadmap";
import { formatPeso } from "@/domain/money";
import { loadProfile } from "@/server/services/budget-data";
import { loadRoadmap } from "@/server/services/roadmap";
import { requireMember } from "@/server/viewer";
import { Card, EmptyState, PageHeader, SectionTitle, StatusBadge } from "@/ui/kit";
import { toneFor } from "@/ui/task-tone";

export const metadata: Metadata = { title: "Roadmap" };

export default async function RoadmapPage() {
  const v = await requireMember();
  const profile = await loadProfile(db, v.principal.workspaceId);
  const { view, byId } = await loadRoadmap(db, v.principal.workspaceId, profile.startingPoint);

  const row = (t: TaskView) => {
    const full = byId.get(t.task.id)!;
    return (
      <li key={t.task.id}>
        <Link href={`/roadmap/${t.task.id}` as Route} className="block py-2.5">
          <div className="flex items-start justify-between gap-3">
            <span className={t.state.kind === "done" || t.state.kind === "skipped" ? "text-muted" : "font-semibold"}>{t.task.title}</span>
            <StatusBadge tone={toneFor(t)} />
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[14px] text-muted">
            <span className="label text-[12px]">{full.area}</span>
            {full.estimateCents !== null && full.estimateCents > 0 && t.state.kind !== "skipped" && (
              <span className="num">
                {full.estimateBasis === "template_mid" ? "≈ " : ""}
                {formatPeso(full.estimateCents, { noCentavos: true })}
              </span>
            )}
            {t.state.kind === "blocked" && <span>Waiting on: {t.state.by.map((b) => b.title).join(", ")}</span>}
          </div>
        </Link>
      </li>
    );
  };

  const groupByStage = (vs: TaskView[]) => {
    const m = new Map<string, TaskView[]>();
    for (const x of vs) m.set(x.task.stage, [...(m.get(x.task.stage) ?? []), x]);
    return [...m.entries()];
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Roadmap"
        subtitle={
          <>
            You said: <b>{STARTING_POINT_LABELS[profile.startingPoint]}</b>. Local steps are for {profile.barangay}, {profile.municipalityName}.
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        {view.progress
          .filter((p) => p.total > 0)
          .map((p) => (
            <span key={p.stage} className={`label rounded-full border-[1.5px] px-3 py-1 text-[13px] ${p.stage === view.focusStage ? "border-green bg-green text-cream" : "border-line bg-surface text-muted"}`}>
              {STAGE_LABELS[p.stage]} <span className="num">{p.finished}/{p.total}</span>
            </span>
          ))}
      </div>

      <Card strong>
        <SectionTitle>Now · {STAGE_LABELS[view.focusStage]}</SectionTitle>
        {view.now.length === 0 ? <EmptyState title="Nothing in this stage" /> : <ul className="divide-y-[1.5px] divide-line">{view.now.map(row)}</ul>}
      </Card>

      {view.catchUp.length > 0 && (
        <Card>
          <SectionTitle>Catch up — mark what&rsquo;s done</SectionTitle>
          <p className="mb-1 text-[14px] text-muted">Earlier steps you may already have finished. Tick them off or skip them so later steps unblock.</p>
          <ul className="divide-y-[1.5px] divide-line">{view.catchUp.map(row)}</ul>
        </Card>
      )}

      {groupByStage(view.later).map(([stage, items]) => (
        <details key={stage} className="rounded-lg border-[1.5px] border-line bg-surface p-4">
          <summary className="label cursor-pointer text-[15px] text-muted">
            Later · {STAGE_LABELS[stage as keyof typeof STAGE_LABELS]} ({items.length})
          </summary>
          <ul className="mt-2 divide-y-[1.5px] divide-line">{items.map(row)}</ul>
        </details>
      ))}

      <p className="text-[14px] text-muted">
        <StatusBadge tone="unverified" /> Local requirements and costs are starting points, not verified facts. They become verified as you file them.
      </p>
    </div>
  );
}
