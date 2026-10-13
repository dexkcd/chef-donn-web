/** The last Overview figures, kept on the phone so they can be read with no signal. */
import { offlineDb } from "./outbox";

export interface OverviewSnapshot {
  asOf: string;
  restaurant: string;
  planned: number;
  committed: number;
  paid: number;
  cashOnHand: number;
  contingencyLeft: number;
  contingencyPlanned: number;
  stillToPay: number;
  due: { description: string; dueDate: string; outstanding: number; overdue: boolean }[];
  nextUp: { title: string; state: string }[];
}

export async function saveSnapshot(s: OverviewSnapshot): Promise<void> {
  try {
    const db = await offlineDb();
    await db.put("snapshot", s, "overview");
  } catch {
    // Private mode or storage blocked: the app still works online.
  }
}

export async function loadSnapshot(): Promise<OverviewSnapshot | null> {
  try {
    const db = await offlineDb();
    return ((await db.get("snapshot", "overview")) as OverviewSnapshot | undefined) ?? null;
  } catch {
    return null;
  }
}
