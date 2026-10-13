import type { Metadata } from "next";
import { OfflineView } from "./offline-view";

export const metadata: Metadata = { title: "Offline" };

/** Served by the service worker when there's no signal and the page wasn't cached. */
export default function OfflinePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <OfflineView />
    </main>
  );
}
