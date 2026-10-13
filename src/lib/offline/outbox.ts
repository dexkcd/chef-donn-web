/**
 * The outbox: writes made on a phone with no signal wait here (IndexedDB) and are sent in
 * order when the connection returns. Each item keeps the id it was created with — the server
 * dedupes on it, so a retry can never create a second receipt or payment. Same contract as
 * the Android apps' pending-command queue.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type OutboxItem =
  | OutboxBase<"receipt.capture", { blob: Blob; mime: string; name: string; note: string | null }>
  | OutboxBase<"payment.log", Record<string, unknown>>
  | OutboxBase<"task.setStatus", { taskId: string; status: string }>
  | OutboxBase<"buildlog.add", Record<string, unknown>>;

interface OutboxBase<K extends string, P> {
  /** The client id. Never regenerated, so replays are idempotent. */
  id: string;
  kind: K;
  payload: P;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: "pending" | "failed";
  lastError: string | null;
  /** Shown in the outbox list. */
  label: string;
}

interface Schema extends DBSchema {
  outbox: { key: string; value: OutboxItem };
  snapshot: { key: string; value: unknown };
}

export const outboxEvents = typeof EventTarget !== "undefined" ? new EventTarget() : (null as unknown as EventTarget);

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;
export function offlineDb(): Promise<IDBPDatabase<Schema>> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  dbPromise ??= openDB<Schema>("chefdonn", 1, {
    upgrade(db) {
      db.createObjectStore("outbox", { keyPath: "id" });
      db.createObjectStore("snapshot");
    },
  });
  return dbPromise;
}

function changed() {
  outboxEvents?.dispatchEvent(new Event("change"));
}

export async function enqueue<I extends OutboxItem>(item: Omit<I, "createdAt" | "attempts" | "nextAttemptAt" | "status" | "lastError">): Promise<void> {
  const db = await offlineDb();
  await db.put("outbox", { ...item, createdAt: Date.now(), attempts: 0, nextAttemptAt: 0, status: "pending", lastError: null } as OutboxItem);
  // Ask the browser not to evict our data (best effort; matters on iOS).
  void navigator.storage?.persist?.();
  changed();
}

export async function listOutbox(): Promise<OutboxItem[]> {
  try {
    const db = await offlineDb();
    return (await db.getAll("outbox")).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function pendingCount(): Promise<number> {
  return (await listOutbox()).length;
}

export async function updateItem(item: OutboxItem): Promise<void> {
  const db = await offlineDb();
  await db.put("outbox", item);
  changed();
}

export async function removeItem(id: string): Promise<void> {
  const db = await offlineDb();
  await db.delete("outbox", id);
  changed();
}

/** Put a refused item back in the queue after the person fixed the cause. */
export async function retryItem(id: string): Promise<void> {
  const db = await offlineDb();
  const item = await db.get("outbox", id);
  if (!item) return;
  await db.put("outbox", { ...item, status: "pending", nextAttemptAt: 0, lastError: null });
  changed();
}
