"use client";

import { useEffect } from "react";

/** Register the service worker in production builds (dev keeps caching out of the way). */
export function SwRegister({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, [enabled]);
  return null;
}

/** On the sign-in screen: drop cached pages so the next person can't see them offline. */
export function ClearPageCache() {
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage("clear-pages");
  }, []);
  return null;
}
