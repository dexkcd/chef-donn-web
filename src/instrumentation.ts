/**
 * Background sweeper: every 60s, pick up receipts and price searches that are waiting or got
 * stuck (e.g. the server restarted mid-job). Requests also kick their own job via after(),
 * so this is the safety net, not the main path.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_SWEEPER === "1") return;
  const { sweepReceipts } = await import("./server/jobs/extraction");
  const { sweepPriceSearches } = await import("./server/jobs/price-search");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await sweepReceipts();
      await sweepPriceSearches();
    } catch (e) {
      console.error("[sweeper]", e);
    } finally {
      running = false;
    }
  };
  setInterval(() => void tick(), 60_000).unref?.();
  setTimeout(() => void tick(), 5_000).unref?.();
}
