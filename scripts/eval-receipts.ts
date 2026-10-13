/**
 * Read a folder of real receipt photos with the live extractor and compare against expected
 * values, to choose RECEIPT_MODEL / check prompt changes. Spends API credits.
 *
 *   ANTHROPIC_API_KEY=… pnpm eval:receipts ./receipts-sample
 *
 * Optional `<folder>/expected.json`: { "<file name>": { "total": "1120.00", "date": "2026-10-12", "vendor": "…" } }
 */
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { DEFAULT_CATEGORIES } from "../src/db/seed/categories";
import { parsePeso } from "../src/domain/money";
import { AnthropicReceiptExtractor } from "../src/lib/ai/receipts/anthropic";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: pnpm eval:receipts <folder>");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Set ANTHROPIC_API_KEY — this runs the real extractor.");
  const model = process.env.RECEIPT_MODEL ?? "claude-opus-5-5";
  const extractor = new AnthropicReceiptExtractor(model);
  const expected: Record<string, { total?: string; date?: string; vendor?: string }> = await readFile(join(dir, "expected.json"), "utf8")
    .then((s) => JSON.parse(s))
    .catch(() => ({}));
  const categories = DEFAULT_CATEGORIES.filter((c) => c.kind !== "contingency").map((c) => ({ id: c.key, name: c.name, hint: c.hint }));
  const files = (await readdir(dir)).filter((f) => MIME[extname(f).toLowerCase()]);
  let totalOk = 0;
  let dateOk = 0;
  let checked = 0;
  for (const f of files) {
    const bytes = new Uint8Array(await readFile(join(dir, f)));
    const t0 = Date.now();
    try {
      const ex = await extractor.extract({
        bytes,
        mime: MIME[extname(f).toLowerCase()]!,
        context: { categories, openLines: [], today: new Date().toISOString().slice(0, 10) },
      });
      const exp = expected[f];
      const totalMatch = exp?.total ? parsePeso(exp.total) === (ex.total.value ? parsePeso(ex.total.value) : null) : null;
      const dateMatch = exp?.date ? exp.date === ex.date.value : null;
      if (exp) {
        checked++;
        if (totalMatch) totalOk++;
        if (dateMatch) dateOk++;
      }
      console.log(
        [f, `${Date.now() - t0}ms`, ex.docKind, ex.vendorName.value, `total ${ex.total.value} (${ex.total.confidence})${totalMatch === null ? "" : totalMatch ? " ✓" : " ✕"}`, `date ${ex.date.value}${dateMatch === null ? "" : dateMatch ? " ✓" : " ✕"}`, `cat ${ex.suggestedCategoryId}`].join(" · "),
      );
    } catch (e) {
      console.log(`${f} · FAILED · ${e instanceof Error ? e.message : e}`);
    }
  }
  if (checked > 0) console.log(`\n${model}: total ${totalOk}/${checked}, date ${dateOk}/${checked}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
