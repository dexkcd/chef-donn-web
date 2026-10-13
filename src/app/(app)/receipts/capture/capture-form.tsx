"use client";

import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { useRef, useState } from "react";
import { compressForUpload } from "@/lib/offline/compress";
import { drainOutbox } from "@/lib/offline/drain";
import { enqueue, type OutboxItem } from "@/lib/offline/outbox";
import { Button, Notice } from "@/ui/kit";
import { OutboxList } from "@/ui/outbox-list";

/**
 * Take or pick a photo → shrink it → put it in the outbox with a fresh id → try to send.
 * With no signal it simply waits on the phone and goes later; the id never changes.
 */
export function CaptureForm({ stayOnPage = false }: { stayOnPage?: boolean }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  const router = useRouter();
  const offline = useOffline();

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const { blob, mime, name } = await compressForUpload(file);
        await enqueue<Extract<OutboxItem, { kind: "receipt.capture" }>>({
          id: crypto.randomUUID(),
          kind: "receipt.capture",
          payload: { blob, mime, name, note: note.trim() || null },
          label: `Receipt photo${note.trim() ? ` · ${note.trim()}` : ""}`,
        });
      }
      void drainOutbox();
      // Offline, a navigation would wait for signal; stay here and show what's queued instead.
      if (stayOnPage || offline || !navigator.onLine) {
        setBusy(false);
        setNote("");
        setQueued((n) => n + files.length);
      } else router.push("/receipts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that photo.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Notice tone="danger" title={error} />}
      {queued > 0 && (
        <Notice tone="success" title={`Saved on this phone (${queued}).`}>
          {offline ? "It sends by itself when you have signal — you can add more." : "Sending now."}
        </Notice>
      )}
      <label className="flex flex-col gap-1">
        <span className="label text-[14px] text-ink-2">Note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. paid by Dexter, for the grease trap"
          className="min-h-[56px] rounded-md border-[1.5px] border-ink bg-surface px-3 text-[18px]"
        />
      </label>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handle(e.target.files)} data-testid="camera-input" />
      <input ref={gallery} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => void handle(e.target.files)} data-testid="gallery-input" />
      <Button size="lg" block disabled={busy} onClick={() => camera.current?.click()}>
        {busy ? "Adding…" : "Take a photo"}
      </Button>
      <Button size="md" variant="secondary" block disabled={busy} onClick={() => gallery.current?.click()}>
        Choose a screenshot or file
      </Button>
      <p className="text-[14px] text-muted">GCash and Maya screenshots work too. No signal? It waits on this phone and sends itself later.</p>
      {!stayOnPage && <OutboxList />}
    </div>
  );
}
