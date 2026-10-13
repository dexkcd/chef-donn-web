"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refresh the page's server data every few seconds while background work is running. */
export function PollRefresh({ everyMs = 3000, maxMs = 180_000 }: { everyMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const t = window.setInterval(() => {
      if (Date.now() - started > maxMs) window.clearInterval(t);
      else router.refresh();
    }, everyMs);
    return () => window.clearInterval(t);
  }, [router, everyMs, maxMs]);
  return null;
}
