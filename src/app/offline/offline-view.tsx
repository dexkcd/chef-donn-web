"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDate } from "@/domain/dates";
import { formatPeso } from "@/domain/money";
import { loadSnapshot, type OverviewSnapshot } from "@/lib/offline/snapshot";
import { CaptureForm } from "@/app/(app)/receipts/capture/capture-form";
import { Card, KeyValue, SectionTitle } from "@/ui/kit";
import { OutboxList } from "@/ui/outbox-list";

export function OfflineView() {
  const [snap, setSnap] = useState<OverviewSnapshot | null | undefined>(undefined);
  useEffect(() => {
    void loadSnapshot().then(setSnap);
  }, []);
  const asOf = snap ? new Date(snap.asOf) : null;
  return (
    <div className="flex flex-col gap-4">
      <div role="status" className="label rounded-md border-[3px] border-red bg-red px-3 py-2 text-white">
        ✕ Offline{asOf ? ` — figures from ${asOf.toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
      </div>
      <Card>
        <SectionTitle>Add a receipt — it sends when you have signal</SectionTitle>
        <CaptureForm stayOnPage />
      </Card>
      <OutboxList />
      {snap === undefined ? null : snap === null ? (
        <Card>
          <p className="text-muted">No saved figures on this phone yet. Open the Overview once with signal and it&rsquo;ll be here next time.</p>
        </Card>
      ) : (
        <>
          <Card strong>
            <div className="label text-[13px] text-muted">Cash on hand · {snap.restaurant}</div>
            <div className="num text-[40px] font-semibold leading-none">{formatPeso(snap.cashOnHand, { noCentavos: true })}</div>
            <div className="mt-2 text-muted">{formatPeso(snap.stillToPay, { noCentavos: true })} still to pay</div>
          </Card>
          <Card>
            <KeyValue
              items={[
                { k: "○ Planned", v: <span className="num">{formatPeso(snap.planned, { noCentavos: true })}</span> },
                { k: "● Committed", v: <span className="num">{formatPeso(snap.committed, { noCentavos: true })}</span> },
                { k: "✓ Paid", v: <span className="num">{formatPeso(snap.paid, { noCentavos: true })}</span> },
                { k: "Contingency left", v: <span className="num">{formatPeso(snap.contingencyLeft, { noCentavos: true })}</span> },
              ]}
            />
          </Card>
          <Card>
            <SectionTitle>Due in the next 14 days</SectionTitle>
            {snap.due.length === 0 ? (
              <p className="text-muted">Nothing was due.</p>
            ) : (
              <ul className="divide-y-[1.5px] divide-line">
                {snap.due.map((d) => (
                  <li key={`${d.description}-${d.dueDate}`} className="flex justify-between gap-3 py-2">
                    <span>
                      <span className="block font-semibold">{d.description}</span>
                      <span className={`text-[14px] ${d.overdue ? "font-semibold text-red" : "text-muted"}`}>
                        {d.overdue ? "▲ Overdue · " : ""}
                        {formatDate(d.dueDate, { withYear: false })}
                      </span>
                    </span>
                    <span className="num font-semibold">{formatPeso(d.outstanding, { noCentavos: true })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
      <Link href="/" className="label text-center text-green">
        Try again
      </Link>
    </div>
  );
}
