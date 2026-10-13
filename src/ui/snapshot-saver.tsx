"use client";

import { useEffect } from "react";
import { saveSnapshot, type OverviewSnapshot } from "@/lib/offline/snapshot";

/** Keeps the latest Overview figures on the phone for reading offline. */
export function SnapshotSaver({ snapshot }: { snapshot: OverviewSnapshot }) {
  useEffect(() => {
    void saveSnapshot(snapshot);
  }, [snapshot]);
  return null;
}
