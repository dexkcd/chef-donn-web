"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { drainOutbox } from "@/lib/offline/drain";
import { listOutbox, outboxEvents, removeItem, retryItem, type OutboxItem } from "@/lib/offline/outbox";
import { Button, Card, SectionTitle, StatusBadge } from "./kit";

/** Receipts and changes still on this phone, waiting for signal. */
export function OutboxList() {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    let had = 0;
    const refresh = () =>
      listOutbox().then((xs) => {
        if (!alive) return;
        // Something just finished sending: pull fresh server data.
        if (xs.length < had) router.refresh();
        had = xs.length;
        setItems(xs);
      });
    void refresh();
    outboxEvents.addEventListener("change", refresh);
    return () => {
      alive = false;
      outboxEvents.removeEventListener("change", refresh);
    };
  }, [router]);

  if (items.length === 0) return null;
  return (
    <Card strong>
      <SectionTitle action={<Button size="sm" variant="secondary" onClick={() => void drainOutbox({ force: true })}>Send now</Button>}>On this phone ({items.length})</SectionTitle>
      <ul className="divide-y-[1.5px] divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{i.label}</span>
              {i.lastError && <span className={`text-[14px] ${i.status === "failed" ? "font-semibold text-red" : "text-muted"}`}>{i.lastError}</span>}
            </span>
            {i.status === "failed" ? (
              <span className="flex shrink-0 gap-1">
                <Button size="sm" variant="secondary" onClick={() => void retryItem(i.id).then(() => drainOutbox({ force: true }))}>
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void removeItem(i.id)}>
                  Discard
                </Button>
              </span>
            ) : (
              <StatusBadge tone="queued" label="Waiting" />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
