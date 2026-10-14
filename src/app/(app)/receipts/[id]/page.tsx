import { eq } from "drizzle-orm";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { payment } from "@/db/schema";
import { PAYMENT_METHOD_LABELS } from "@/domain/budget";
import { formatDate } from "@/domain/dates";
import { can } from "@/domain/permissions";
import { emptyDraft } from "@/lib/receipts/draft";
import { rejectReceiptAction, retryExtractionAction } from "@/server/actions/receipts";
import { loadCategories } from "@/server/services/budget-data";
import { getReceipt, openLines } from "@/server/services/receipts";
import { requireMember } from "@/server/viewer";
import { ActionForm, Submit, TextField } from "@/ui/form";
import { Card, KeyValue, Money, Notice, PageHeader, StatusBadge } from "@/ui/kit";
import { PollRefresh } from "@/ui/poll-refresh";
import { ReviewForm } from "./review-form";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await requireMember();
  const ws = v.principal.workspaceId;
  const role = v.principal.actor.role;
  const row = await getReceipt(db, ws, id);
  if (!row) notFound();
  const { r, d } = row;
  const isImage = d.mime.startsWith("image/");

  const media = (
    <a href={`/api/receipts/${r.id}/file`} target="_blank" rel="noopener" className="block">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/receipts/${r.id}/file`} alt="Receipt photo" className="max-h-[60dvh] w-full rounded-lg border-[3px] border-ink bg-surface object-contain" />
      ) : (
        <span className="flex min-h-[72px] items-center justify-center rounded-lg border-[3px] border-ink bg-surface font-semibold">Open the PDF ↗</span>
      )}
    </a>
  );

  if (r.status === "uploaded" || r.status === "extracting") {
    return (
      <div className="flex flex-col gap-4">
        <PollRefresh />
        <PageHeader title="Reading the receipt…" back={{ href: "/receipts", label: "Receipts" }} subtitle={<StatusBadge tone="reading" />} />
        {media}
        <p className="text-muted">This takes a few seconds. You can leave — it&rsquo;ll be waiting in Receipts.</p>
        {r.lastError && <Notice tone="warning" title="First try didn't work — retrying.">{r.lastError}</Notice>}
      </div>
    );
  }

  if (r.status === "confirmed" || r.status === "rejected") {
    const [pay] = r.paymentId ? await db.select().from(payment).where(eq(payment.id, r.paymentId)) : [];
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title={r.draft?.vendorName.value ?? "Receipt"}
          back={{ href: "/receipts", label: "Receipts" }}
          subtitle={<StatusBadge tone={r.status === "confirmed" ? "confirmed" : "rejected"} />}
        />
        {r.status === "rejected" && <Notice tone="warning" title="Rejected">{r.rejectedReason}</Notice>}
        {pay && (
          <Card strong>
            <KeyValue
              items={[
                { k: "Paid", v: <Money cents={pay.amountCents} className="font-semibold" /> },
                { k: "Date", v: <span className="num">{formatDate(pay.paidOn)}</span> },
                { k: "How", v: PAYMENT_METHOD_LABELS[pay.method] },
                { k: "Budget line", v: <Link className="font-semibold text-green underline" href={`/budget/lines/${pay.moneyLineId}` as Route}>Open ›</Link> },
                ...(pay.voidedAt ? [{ k: "Status", v: <span className="text-red">✕ Payment voided</span> }] : []),
              ]}
            />
          </Card>
        )}
        {media}
      </div>
    );
  }

  // needs_review / extraction_failed
  const draft = r.draft ?? emptyDraft({ aiOff: false });
  const [lines, cats] = await Promise.all([openLines(db, ws), loadCategories(db, ws)]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const suggestedLine = lines.find((l) => l.id === draft.moneyLineId.value);
  const suggestionNote =
    draft.moneyLineId.source === "rule" && suggestedLine
      ? `Suggested from last time you paid this seller: ${catName.get(suggestedLine.categoryId)} › ${suggestedLine.description}.`
      : draft.moneyLineId.source === "ai" && suggestedLine
        ? `AI suggestion: ${catName.get(suggestedLine.categoryId)} › ${suggestedLine.description}.`
        : draft.categoryId.value
          ? `Looks like ${catName.get(draft.categoryId.value)} — pick the line.`
          : null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Check this receipt" back={{ href: "/receipts", label: "Receipts" }} subtitle={<StatusBadge tone={r.status === "extraction_failed" ? "failed" : "review"} />} />
      {r.status === "extraction_failed" && (
        <>
          <Notice tone="warning" title="The AI couldn't read this one — fill it in from the photo, or try again.">
            {r.lastError}
          </Notice>
          {can(role, "receipt.capture") && (
            <ActionForm action={retryExtractionAction}>
              <input type="hidden" name="receiptId" value={r.id} />
              <Submit variant="secondary" pendingLabel="Starting…">
                Read it again
              </Submit>
            </ActionForm>
          )}
        </>
      )}
      {media}
      <ReviewForm
        receiptId={r.id}
        draft={draft}
        lines={lines.map((l) => ({ id: l.id, label: l.description, categoryName: catName.get(l.categoryId) ?? "Other" }))}
        categories={cats.filter((c) => c.kind !== "contingency" && !c.archivedAt).map((c) => ({ id: c.id, name: c.name }))}
        canNewLine={can(role, "receipt.confirm_new_line")}
        duplicateLinks={(r.duplicateSignals ?? []).map((s) => ({ kind: s.kind, href: `/receipts/${s.receiptId}` }))}
        suggestionNote={suggestionNote}
      />
      {can(role, "receipt.reject") && (
        <details className="rounded-lg border-[1.5px] border-line bg-surface p-4">
          <summary className="label cursor-pointer text-red">Not a business expense / reject</summary>
          <ActionForm action={rejectReceiptAction} className="mt-3">
            <input type="hidden" name="receiptId" value={r.id} />
            <TextField name="reason" label="Why" placeholder="Duplicate photo" />
            <Submit variant="danger">Reject receipt</Submit>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
