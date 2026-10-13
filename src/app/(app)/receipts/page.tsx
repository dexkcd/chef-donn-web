import type { Metadata, Route } from "next";
import Link from "next/link";
import { db } from "@/db/client";
import { formatDate } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { listReceipts } from "@/server/services/receipts";
import { requireMember } from "@/server/viewer";
import { ButtonLink, Card, EmptyState, Money, Notice, PageHeader, SectionTitle, StatusBadge } from "@/ui/kit";
import { OutboxList } from "@/ui/outbox-list";
import { PollRefresh } from "@/ui/poll-refresh";
import type { StatusTone } from "@/ui/status";

export const metadata: Metadata = { title: "Receipts" };

const TONE: Record<string, StatusTone> = {
  uploaded: "reading",
  extracting: "reading",
  needs_review: "review",
  extraction_failed: "failed",
  confirmed: "confirmed",
  rejected: "rejected",
};

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const v = await requireMember();
  const rows = await listReceipts(db, v.principal.workspaceId);
  const toReview = rows.filter((x) => x.r.status === "needs_review" || x.r.status === "extraction_failed");
  const reading = rows.filter((x) => x.r.status === "uploaded" || x.r.status === "extracting");
  const done = rows.filter((x) => x.r.status === "confirmed" || x.r.status === "rejected");
  const canCapture = can(v.principal.actor.role, "receipt.capture");

  const item = (x: (typeof rows)[number]) => {
    const vendor = x.r.draft?.vendorName.value;
    const total = x.r.totalCents ?? x.r.draft?.totalCents.value ?? null;
    return (
      <li key={x.r.id}>
        <Link href={`/receipts/${x.r.id}` as Route} className="flex min-h-[72px] items-center gap-3 py-2">
          {x.d.mime.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/receipts/${x.r.id}/file`} alt="" loading="lazy" className="size-14 shrink-0 rounded-md border-[1.5px] border-line object-cover" />
          ) : (
            <span className="label flex size-14 shrink-0 items-center justify-center rounded-md border-[1.5px] border-line text-muted">PDF</span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{vendor ?? (x.r.status === "uploaded" || x.r.status === "extracting" ? "Reading…" : "Unknown seller")}</span>
            <span className="text-[14px] text-muted">
              {x.r.receiptDate ? formatDate(x.r.receiptDate) : `Added ${formatDate(x.d.createdAt.toISOString().slice(0, 10))}`}
              {x.r.duplicateSignals?.some((s) => s.kind !== "similar") && x.r.status === "needs_review" ? " · ▲ possible duplicate" : ""}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {total !== null && <Money cents={total} noCentavos className="font-semibold" />}
            <StatusBadge tone={TONE[x.r.status] ?? "review"} />
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Receipts" subtitle="Photograph it, check what the AI read, and it becomes a payment." />
      {saved && <Notice tone="success" title="Saved — the payment is on the budget." />}
      {canCapture && (
        <ButtonLink href="/receipts/capture" size="lg" block>
          ＋ Add a receipt
        </ButtonLink>
      )}
      <OutboxList />
      {reading.length > 0 && <PollRefresh />}

      <Card strong={toReview.length > 0}>
        <SectionTitle>To review ({toReview.length})</SectionTitle>
        {toReview.length === 0 ? <p className="text-muted">Nothing waiting for you.</p> : <ul className="divide-y-[1.5px] divide-line">{toReview.map(item)}</ul>}
      </Card>

      {reading.length > 0 && (
        <Card>
          <SectionTitle>Reading ({reading.length})</SectionTitle>
          <ul className="divide-y-[1.5px] divide-line">{reading.map(item)}</ul>
        </Card>
      )}

      <Card>
        <SectionTitle>Done</SectionTitle>
        {done.length === 0 ? (
          <EmptyState title="No receipts yet">Every receipt you confirm shows up here, linked to its payment.</EmptyState>
        ) : (
          <ul className="divide-y-[1.5px] divide-line">{done.map(item)}</ul>
        )}
      </Card>
    </div>
  );
}
