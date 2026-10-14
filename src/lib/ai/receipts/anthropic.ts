/**
 * Read a receipt photo with Claude vision + structured output. Categories and lines are
 * offered as short codes (C1…, L1…) so the model picks from this workspace's real ones; every
 * value comes back with a confidence and stays "AI-extracted — confirm" until a person checks it.
 */
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PAYMENT_METHODS } from "@/domain/budget";
import { anthropic, FALLBACK_BETA } from "../anthropic-client";
import { DOC_KINDS, type Confidence, type ReceiptExtraction } from "../receipt-types";
import { ExtractionFailed, type ExtractionContext, type ReceiptExtractor } from "./extractor";

export const RECEIPT_PROMPT_VERSION = "receipt.v2";

const conf = z.enum(["high", "medium", "low"]);
// No nullable fields: the API allows at most 16 union-typed parameters per schema (see
// ../schema-limits). "Not on the receipt" is "" (or "unknown"/"none"), turned into null below.
const text = z.object({ value: z.string(), confidence: conf });
const NO_METHOD = "unknown";
const NO_CODE = "none";

export function schemaFor(ctx: ExtractionContext) {
  const catCodes = ctx.categories.map((_, i) => `C${i + 1}`);
  const lineCodes = ctx.openLines.map((_, i) => `L${i + 1}`);
  return z.object({
    doc_kind: z.enum(DOC_KINDS),
    vendor_name: text,
    vendor_tin: text,
    vendor_address: text,
    doc_number: text,
    date: text,
    total: text,
    vatable_sales: text,
    vat: text,
    vat_exempt: text,
    zero_rated: text,
    payment_method: z.object({ value: z.enum([...PAYMENT_METHODS, NO_METHOD]), confidence: conf }),
    ewallet_reference: text,
    line_items: z.array(z.object({ description: z.string(), qty: z.string(), unit_price: z.string(), amount: z.string() })),
    category_code: z.enum([...catCodes, NO_CODE]),
    line_code: z.enum([...lineCodes, NO_CODE]),
    category_confidence: conf,
    reviewer_notes: z.string(),
  });
}

export type ReceiptOutput = z.output<ReturnType<typeof schemaFor>>;

const blank = (s: string): string | null => (s.trim() === "" ? null : s.trim());
const textField = (f: { value: string; confidence: Confidence }) => ({ value: blank(f.value), confidence: f.confidence });

/** The model's answer → what we store. Codes map back to this workspace's real ids. */
export function toExtraction(o: ReceiptOutput, ctx: ExtractionContext, model: string | null): ReceiptExtraction {
  const catIdx = o.category_code === NO_CODE ? -1 : Number(o.category_code.slice(1)) - 1;
  const lineIdx = o.line_code === NO_CODE ? -1 : Number(o.line_code.slice(1)) - 1;
  return {
    provider: "anthropic",
    model,
    promptVersion: RECEIPT_PROMPT_VERSION,
    extractedAt: new Date().toISOString(),
    docKind: o.doc_kind,
    vendorName: textField(o.vendor_name),
    vendorTin: textField(o.vendor_tin),
    vendorAddress: textField(o.vendor_address),
    docNumber: textField(o.doc_number),
    date: textField(o.date),
    total: textField(o.total),
    vatable: textField(o.vatable_sales),
    vat: textField(o.vat),
    vatExempt: textField(o.vat_exempt),
    zeroRated: textField(o.zero_rated),
    method: { value: o.payment_method.value === NO_METHOD ? null : o.payment_method.value, confidence: o.payment_method.confidence },
    ewalletRef: textField(o.ewallet_reference),
    lineItems: o.line_items.map((l) => ({ description: l.description.trim(), qty: blank(l.qty), unitPrice: blank(l.unit_price), amount: blank(l.amount) })),
    suggestedCategoryId: ctx.categories[catIdx]?.id ?? null,
    suggestedMoneyLineId: ctx.openLines[lineIdx]?.id ?? null,
    categoryConfidence: o.category_confidence,
    reviewerNotes: blank(o.reviewer_notes),
  };
}

const SYSTEM = `You read Philippine purchase receipts for a restaurant that is being built. The photo may be an official receipt (OR), a sales invoice (SI), a handwritten "resibo", a GCash or Maya screenshot, or a bank transfer confirmation.

Rules:
- Copy what is printed or written. If a value isn't on the document or you can't read it, return an empty string "" with confidence "low" (payment method "unknown"). Never guess a total.
- Amounts: plain decimal strings in PHP without "₱", "PHP" or thousands separators, e.g. "1250.00".
- Dates: YYYY-MM-DD. Philippine receipts usually write dates as MM/DD/YYYY.
- VAT: "VATable sales" (amount net of VAT), "VAT amount" (12%), "VAT-exempt sales" and "zero-rated sales" when printed.
- TIN: as printed, e.g. "123-456-789-00000".
- Payment method: "gcash"/"maya" for e-wallet screenshots, "bank" for transfers, "card" if a card slip, otherwise "cash" when the receipt implies cash or says nothing.
- Pick the budget category code (and, if one clearly fits, the budget line code) this purchase belongs to; "none" when nothing fits. Use category_confidence "low" when unsure.
- reviewer_notes: anything a person should double-check (smudged total, two dates, handwritten corrections). Keep it short; "" when there's nothing.`;

function contextText(ctx: ExtractionContext): string {
  const cats = ctx.categories.map((c, i) => `C${i + 1}: ${c.name}${c.hint ? ` (${c.hint})` : ""}`).join("\n");
  const lines = ctx.openLines.length > 0 ? ctx.openLines.map((l, i) => `L${i + 1}: ${l.description} [${`C${ctx.categories.findIndex((c) => c.id === l.categoryId) + 1}`}]`).join("\n") : "(none yet)";
  return `Today is ${ctx.today}.\n\nBudget categories:\n${cats}\n\nOpen budget lines:\n${lines}\n\nRead the attached receipt.`;
}

export class AnthropicReceiptExtractor implements ReceiptExtractor {
  readonly name = "anthropic";
  constructor(private readonly model: string) {}

  async extract({ bytes, mime, context }: { bytes: Uint8Array; mime: string; context: ExtractionContext }): Promise<ReceiptExtraction> {
    const data = Buffer.from(bytes).toString("base64");
    const media =
      mime === "application/pdf"
        ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
        : ({ type: "image", source: { type: "base64", media_type: mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data } } as const);

    const res = await anthropic().beta.messages.parse({
      model: this.model,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(schemaFor(context)) },
      system: SYSTEM,
      messages: [{ role: "user", content: [media, { type: "text", text: contextText(context) }] }],
    });
    if (res.stop_reason === "refusal") throw new ExtractionFailed("The model declined to read this image.");
    if (res.stop_reason === "max_tokens") throw new ExtractionFailed("The receipt was too long to read in one go.");
    const o = res.parsed_output;
    if (!o) throw new ExtractionFailed("The receipt couldn't be read.");
    return toExtraction(o, context, res.model);
  }
}
