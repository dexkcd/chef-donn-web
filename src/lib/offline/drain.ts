/**
 * Send queued items in order. A refusal (4xx) parks the item with the server's reason so the
 * person can see why; a network or server error stops the run and retries with backoff.
 */
import { listOutbox, removeItem, updateItem, type OutboxItem } from "./outbox";

let running: Promise<void> | null = null;
let followUp: Promise<void> | null = null;
let followUpForce = false;

/**
 * `force` ignores retry backoff — used when the person taps "Send now" or the browser says
 * the connection is back. The periodic timer respects backoff. Resolves once everything that
 * was queued when it was called has been tried.
 */
export function drainOutbox(opts: { force?: boolean } = {}): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const force = opts.force ?? false;
  if (!running) {
    running = run(force).finally(() => {
      running = null;
    });
    return running;
  }
  // A run is under way and may have listed the outbox before this item went in: one more
  // pass after it, shared by everyone who asks in the meantime.
  followUpForce ||= force;
  followUp ??= running
    .catch(() => {})
    .then(() => {
      const f = followUpForce;
      followUp = null;
      followUpForce = false;
      return drainOutbox({ force: f });
    });
  return followUp;
}

function backoffMs(attempts: number): number {
  return Math.min(5_000 * 2 ** attempts, 5 * 60_000);
}

async function send(item: OutboxItem): Promise<Response> {
  switch (item.kind) {
    case "receipt.capture": {
      const fd = new FormData();
      fd.set("clientId", item.id);
      fd.set("file", item.payload.blob, item.payload.name);
      if (item.payload.note) fd.set("note", item.payload.note);
      return fetch("/api/receipts", { method: "POST", body: fd, credentials: "same-origin" });
    }
    default:
      return fetch("/api/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: item.kind, clientId: item.id, payload: item.payload }),
      });
  }
}

async function run(force: boolean): Promise<void> {
  const now = Date.now();
  const items = (await listOutbox()).filter((i) => i.status === "pending" && (force || i.nextAttemptAt <= now));
  for (const item of items) {
    let res: Response;
    try {
      res = await send(item);
    } catch {
      await updateItem({ ...item, attempts: item.attempts + 1, nextAttemptAt: Date.now() + backoffMs(item.attempts), lastError: "No connection — will retry." });
      return;
    }
    if (res.ok) {
      await removeItem(item.id);
      continue;
    }
    if (res.status === 401) {
      await updateItem({ ...item, lastError: "Signed out — sign in again to send this." });
      return;
    }
    const retryable = res.status >= 500 || res.status === 408 || res.status === 429;
    if (retryable) {
      await updateItem({ ...item, attempts: item.attempts + 1, nextAttemptAt: Date.now() + backoffMs(item.attempts), lastError: `Server busy (${res.status}) — will retry.` });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { reason?: string };
    await updateItem({ ...item, status: "failed", lastError: body.reason ?? `Refused (${res.status}).` });
  }
}
