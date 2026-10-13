"use client";

/**
 * Connection + outbox state, always visible in the header (glyph + colour + label):
 *   ✓ Online · ● 3 waiting · ✕ Offline. Uses Next's useOffline(), which also catches
 *   "WiFi but no internet" — common on island connections.
 */
import { useOffline } from "next/offline";
import { useEffect, useState } from "react";
import { outboxEvents, pendingCount } from "@/lib/offline/outbox";
import { drainOutbox } from "@/lib/offline/drain";
import { cx } from "./kit";

export function useOutboxCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () => pendingCount().then((c) => alive && setN(c), () => {});
    refresh();
    outboxEvents.addEventListener("change", refresh);
    return () => {
      alive = false;
      outboxEvents.removeEventListener("change", refresh);
    };
  }, []);
  return n;
}

export function SyncIndicator() {
  const offline = useOffline();
  const waiting = useOutboxCount();
  useEffect(() => {
    if (!offline) void drainOutbox({ force: true });
  }, [offline]);
  useEffect(() => {
    const tick = () => void drainOutbox();
    const back = () => void drainOutbox({ force: true });
    const visible = () => document.visibilityState === "visible" && back();
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", back);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("online", back);
    };
  }, []);

  const state = offline
    ? { glyph: "✕", label: waiting > 0 ? `Offline · ${waiting} waiting` : "Offline", cls: "bg-red text-white" }
    : waiting > 0
      ? { glyph: "●", label: `${waiting} waiting`, cls: "bg-gold text-ink" }
      : { glyph: "✓", label: "Online", cls: "bg-green-bright text-white" };

  return (
    <button
      type="button"
      onClick={() => void drainOutbox({ force: true })}
      className={cx("label press inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-cream px-3 text-[13px]", state.cls)}
      aria-live="polite"
      title={waiting > 0 ? "Tap to sync now" : undefined}
    >
      <span aria-hidden>{state.glyph}</span>
      {state.label}
    </button>
  );
}
