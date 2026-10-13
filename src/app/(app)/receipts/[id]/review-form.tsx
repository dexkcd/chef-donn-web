"use client";

/**
 * Review what the AI read. Every value shows where it came from and how sure the reader was;
 * nothing counts until a person confirms it (editing a field confirms it). Save stays
 * disabled until payee, date, total, method and budget line are all confirmed.
 */
import { useActionState, useMemo, useState } from "react";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/domain/budget";
import type { Confidence, DraftField, ReceiptDraft } from "@/lib/ai/receipt-types";
import { confirmReceiptAction } from "@/server/actions/receipts";
import { Button, cx, Notice, StatusBadge } from "@/ui/kit";
import type { FormState } from "@/ui/form";

type FieldKey = "vendorName" | "vendorTin" | "docNumber" | "date" | "total" | "vatable" | "vat" | "method" | "moneyLineId";
const REQUIRED: FieldKey[] = ["vendorName", "date", "total", "method", "moneyLineId"];

interface LineOption {
  id: string;
  label: string;
  categoryName: string;
}

const pesoText = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2));

function initial<T>(f: DraftField<T> | undefined, fmt: (v: T) => string = String): { value: string; confirmed: boolean; confidence: Confidence | null; source: string } {
  return { value: f?.value === null || f?.value === undefined ? "" : fmt(f.value), confirmed: false, confidence: f?.confidence ?? null, source: f?.source ?? "none" };
}

export function ReviewForm({
  receiptId,
  draft,
  lines,
  categories,
  canNewLine,
  duplicateLinks,
  suggestionNote,
}: {
  receiptId: string;
  draft: ReceiptDraft;
  lines: LineOption[];
  categories: { id: string; name: string }[];
  canNewLine: boolean;
  duplicateLinks: { kind: "same_file" | "same_doc_number" | "similar"; href: string }[];
  suggestionNote: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(confirmReceiptAction, {});
  const [fields, setFields] = useState(() => ({
    vendorName: initial(draft.vendorName),
    vendorTin: initial(draft.vendorTin),
    docNumber: initial(draft.docNumber),
    date: initial(draft.date),
    total: initial(draft.totalCents, (v) => pesoText(v)),
    vatable: initial(draft.vatableCents, (v) => pesoText(v)),
    vat: initial(draft.vatCents, (v) => pesoText(v)),
    method: initial(draft.method),
    moneyLineId: initial(draft.moneyLineId),
  }));
  const [notDuplicate, setNotDuplicate] = useState(false);

  const set = (k: FieldKey, value: string) => setFields((f) => ({ ...f, [k]: { ...f[k], value, confirmed: true, source: "person" } }));
  const toggle = (k: FieldKey) => setFields((f) => ({ ...f, [k]: { ...f[k], confirmed: !f[k].confirmed } }));
  const confirmHigh = () =>
    setFields((f) => {
      const next = { ...f };
      for (const k of Object.keys(next) as FieldKey[]) if (next[k].confidence === "high" && next[k].value !== "") next[k] = { ...next[k], confirmed: true };
      return next;
    });

  const isNew = fields.moneyLineId.value === "__new__";
  const missing = REQUIRED.filter((k) => !(fields[k].confirmed && fields[k].value !== ""));
  const blockingDup = duplicateLinks.some((d) => d.kind !== "similar");
  const canSave = missing.length === 0 && (!blockingDup || notDuplicate);
  const highCount = (Object.keys(fields) as FieldKey[]).filter((k) => fields[k].confidence === "high" && !fields[k].confirmed && fields[k].value !== "").length;

  const grouped = useMemo(() => {
    const m = new Map<string, LineOption[]>();
    for (const l of lines) m.set(l.categoryName, [...(m.get(l.categoryName) ?? []), l]);
    return [...m.entries()];
  }, [lines]);

  const row = (k: FieldKey, label: string, input: React.ReactNode, opts: { required?: boolean } = {}) => {
    const f = fields[k];
    const err = state.fieldErrors?.[k === "total" ? "totalCents" : k];
    return (
      <div className={cx("rounded-md border-[1.5px] p-3", f.confirmed ? "border-green bg-[#f1f8f4]" : "border-line bg-surface", err && "border-red border-[3px]")}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="label text-[14px] text-ink-2">
            {label}
            {opts.required && <span className="text-red"> *</span>}
          </span>
          {!f.confirmed && f.source === "ai" && <StatusBadge tone="found_online" label={`AI · ${f.confidence ?? "?"} — confirm`} />}
          {!f.confirmed && f.source === "rule" && <StatusBadge tone="found_online" label="Last time — confirm" />}
        </div>
        <div className="flex items-stretch gap-2">
          <div className="min-w-0 flex-1">{input}</div>
          <button
            type="button"
            onClick={() => toggle(k)}
            aria-pressed={f.confirmed}
            aria-label={f.confirmed ? `${label} confirmed — tap to undo` : `Confirm ${label}`}
            className={cx("press label flex min-h-[56px] min-w-[64px] items-center justify-center rounded-md border-[3px] text-[15px]", f.confirmed ? "border-green-deep bg-green text-cream" : "border-ink bg-surface text-ink")}
          >
            {f.confirmed ? "✓ OK" : "✓ ?"}
          </button>
        </div>
        {err && <div className="mt-1 text-[14px] font-semibold text-red">✕ {err}</div>}
        {f.confirmed && <input type="hidden" name="confirmed" value={k === "total" ? "totalCents" : k} />}
      </div>
    );
  };

  const inputCls = "w-full min-h-[56px] rounded-md border-[1.5px] border-ink bg-surface px-3 text-[18px]";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="receiptId" value={receiptId} />
      {state.reason && !state.ok && <Notice tone="danger" title={state.reason} />}
      {draft.aiOff && <Notice tone="info" title="AI reading is off — enter the details from the photo." />}
      {draft.reviewerNotes && <Notice tone="warning" title="The reader noted">{draft.reviewerNotes}</Notice>}
      {highCount > 0 && (
        <Button type="button" variant="secondary" onClick={confirmHigh}>
          ✓ I&rsquo;ve checked the {highCount} high-confidence field{highCount === 1 ? "" : "s"}
        </Button>
      )}

      {row("vendorName", "Paid to", <input name="vendorName" className={inputCls} value={fields.vendorName.value} onChange={(e) => set("vendorName", e.target.value)} />, { required: true })}
      {row("date", "Date", <input name="date" type="date" className={cx(inputCls, "num")} value={fields.date.value} onChange={(e) => set("date", e.target.value)} />, { required: true })}
      {row(
        "total",
        "Total paid",
        <div className="relative">
          <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₱</span>
          <input name="total" inputMode="decimal" className={cx(inputCls, "num pl-8")} value={fields.total.value} onChange={(e) => set("total", e.target.value)} />
        </div>,
        { required: true },
      )}
      {row(
        "method",
        "How it was paid",
        <select name="method" className={inputCls} value={fields.method.value} onChange={(e) => set("method", e.target.value)}>
          <option value="" disabled>
            Pick one
          </option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </select>,
        { required: true },
      )}
      {row(
        "moneyLineId",
        "Budget line",
        <select name="moneyLineId" className={inputCls} value={fields.moneyLineId.value} onChange={(e) => set("moneyLineId", e.target.value)}>
          <option value="" disabled>
            Pick the line this was for
          </option>
          {grouped.map(([cat, ls]) => (
            <optgroup key={cat} label={cat}>
              {ls.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </optgroup>
          ))}
          {canNewLine && <option value="__new__">＋ New unplanned line…</option>}
        </select>,
        { required: true },
      )}
      {suggestionNote && !fields.moneyLineId.confirmed && <p className="-mt-1 text-[14px] text-muted">{suggestionNote}</p>}
      {isNew && (
        <div className="flex flex-col gap-2 rounded-md border-[3px] border-gold-deep bg-gold-wash p-3">
          <p className="text-[14px]">
            <b>▲ Unplanned spending.</b> A new line has no plan, so all of it shows as drawn from contingency.
          </p>
          <select name="newLineCategoryId" className={inputCls} defaultValue="">
            <option value="" disabled>
              Category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input name="newLineDescription" className={inputCls} placeholder="What was it for?" defaultValue={fields.vendorName.value} />
        </div>
      )}

      <details className="rounded-md border-[1.5px] border-line bg-surface p-3">
        <summary className="label cursor-pointer text-[14px]">More details (TIN, OR number, VAT)</summary>
        <div className="mt-3 flex flex-col gap-3">
          {row("docNumber", "OR / SI number", <input name="docNumber" className={cx(inputCls, "num")} value={fields.docNumber.value} onChange={(e) => set("docNumber", e.target.value)} />)}
          {row("vendorTin", "Seller TIN", <input name="vendorTin" className={cx(inputCls, "num")} value={fields.vendorTin.value} onChange={(e) => set("vendorTin", e.target.value)} />)}
          {row("vatable", "VATable sales", <input name="vatable" inputMode="decimal" className={cx(inputCls, "num")} value={fields.vatable.value} onChange={(e) => set("vatable", e.target.value)} />)}
          {row("vat", "VAT (12%)", <input name="vat" inputMode="decimal" className={cx(inputCls, "num")} value={fields.vat.value} onChange={(e) => set("vat", e.target.value)} />)}
          {draft.vatWarnings.map((w) => (
            <Notice key={w.kind} tone="warning" title={w.kind === "vat_not_12_percent" ? "VAT isn't 12% of VATable sales" : "The VAT breakdown doesn't add up to the total"}>
              Check the photo — it may be misread, or the receipt may be wrong.
            </Notice>
          ))}
        </div>
      </details>

      {duplicateLinks.length > 0 && (
        <Notice tone={blockingDup ? "danger" : "warning"} title={blockingDup ? "This looks like a receipt you already have" : "A similar receipt exists"}>
          <ul className="mt-1">
            {duplicateLinks.map((d) => (
              <li key={d.href}>
                <a className="font-semibold text-green underline" href={d.href}>
                  {d.kind === "same_file" ? "Same photo" : d.kind === "same_doc_number" ? "Same seller and OR number" : "Same seller and total, a day apart"} ›
                </a>
              </li>
            ))}
          </ul>
          {blockingDup && (
            <label className="mt-2 flex min-h-[48px] items-center gap-2">
              <input type="checkbox" className="size-6 accent-[#0f4d3a]" checked={notDuplicate} onChange={(e) => setNotDuplicate(e.target.checked)} />
              Not a duplicate — save anyway
            </label>
          )}
        </Notice>
      )}
      {notDuplicate && <input type="hidden" name="notDuplicate" value="1" />}

      <div className="sticky bottom-[72px] z-10 -mx-4 border-t-[3px] border-ink bg-bg px-4 py-3">
        {!canSave && (
          <p className="mb-2 text-[14px] text-muted">
            {missing.length > 0 ? `Confirm: ${missing.map((m) => ({ vendorName: "paid to", date: "date", total: "total", method: "how paid", moneyLineId: "budget line" })[m as "vendorName"]).join(", ")}.` : "Tick “Not a duplicate” to save."}
          </p>
        )}
        <Button type="submit" size="lg" block disabled={!canSave || pending}>
          {pending ? "Saving…" : "Save as payment"}
        </Button>
      </div>
    </form>
  );
}
