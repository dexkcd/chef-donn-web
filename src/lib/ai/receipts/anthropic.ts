/**
 * Read a receipt photo with Claude vision + structured output. Categories and lines are
 * offered as short codes (C1…, L1…) so the model picks from this workspace's real ones; every
 * value comes back with a confidence and stays "AI-extracted — confirm" until a person checks it.
 */
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { PAYMENT_METHODS } from "@/domain/budget";
import { anthropic, FALLBACK_BETA } from "../anthropic-client";
import { DOC_KINDS, type ReceiptExtraction } from "../receipt-types";
import { ExtractionFailed, type ExtractionContext, type ReceiptExtractor } from "./extractor";

export const RECEIPT_PROMPT_VERSION = "receipt.v1";

const conf = z.enum(["high", "medium", "low"]);
const field = <T extends z.ZodType>(t: T) => z.object({ value: t.nullable(), confidence: conf });

function schemaFor(ctx: ExtractionContext) {
  const catCodes = ctx.categories.map((_, i) => `C${i + 1}`) as [string, ...string[]];
  const lineCodes = ctx.openLines.map((_, i) => `L${i + 1}`);
  return z.object({
    doc_kind: z.enum(DOC_KINDS),
    vendor_name: field(z.string()),
    vendor_tin: field(z.string()),
    vendor_address: field(z.string()),
    doc_number: field(z.string()),
    date: field(z.string()),
    total: field(z.string()),
    vatable_sales: field(z.string()),
    vat: field(z.string()),
    vat_exempt: field(z.string()),
    zero_rated: field(z.string()),
    payment_method: field(z.enum(PAYMENT_METHODS)),
    ewallet_reference: field(z.string()),
    line_items: z.array(z.object({ description: z.string(), qty: z.string().nullable(), unit_price: z.string().nullable(), amount: z.string().nullable() })),
    category_code: z.enum(catCodes).nullable(),
    line_code: lineCodes.length > 0 ? z.enum(lineCodes as [string, ...string[]]).nullable() : z.null(),
    category_confidence: conf,
    reviewer_notes: z.string().nullable(),
  });
}

const SYSTEM = `You read Philippine purchase receipts for a restaurant that is being built. The photo may be an official receipt (OR), a sales invoice (SI), a handwritten "resibo", a GCash or Maya screenshot, or a bank transfer confirmation.

Rules:
- Copy what is printed or written. If a value isn't on the document or you can't read it, return null with confidence "low". Never guess a total.
- Amounts: plain decimal strings in PHP without "₱", "PHP" or thousands separators, e.g. "1250.00".
- Dates: YYYY-MM-DD. Philippine receipts usually write dates as MM/DD/YYYY.
- VAT: "VATable sales" (amount net of VAT), "VAT amount" (12%), "VAT-exempt sales" and "zero-rated sales" when printed.
- TIN: as printed, e.g. "123-456-789-00000".
- Payment method: "gcash"/"maya" for e-wallet screenshots, "bank" for transfers, "card" if a card slip, otherwise "cash" when the receipt implies cash or says nothing.
- Pick the budget category code (and, if one clearly fits, the budget line code) this purchase belongs to. Use category_confidence "low" when unsure.
- reviewer_notes: anything a person should double-check (smudged total, two dates, handwritten corrections). Keep it short.`;

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

    const catIdx = o.category_code ? Number(o.category_code.slice(1)) - 1 : -1;
    const lineIdx = o.line_code ? Number(String(o.line_code).slice(1)) - 1 : -1;
    return {
      provider: this.name,
      model: res.model,
      promptVersion: RECEIPT_PROMPT_VERSION,
      extractedAt: new Date().toISOString(),
      docKind: o.doc_kind,
      vendorName: o.vendor_name,
      vendorTin: o.vendor_tin,
      vendorAddress: o.vendor_address,
      docNumber: o.doc_number,
      date: o.date,
      total: o.total,
      vatable: o.vatable_sales,
      vat: o.vat,
      vatExempt: o.vat_exempt,
      zeroRated: o.zero_rated,
      method: o.payment_method,
      ewalletRef: o.ewallet_reference,
      lineItems: o.line_items.map((l) => ({ description: l.description, qty: l.qty, unitPrice: l.unit_price, amount: l.amount })),
      suggestedCategoryId: context.categories[catIdx]?.id ?? null,
      suggestedMoneyLineId: context.openLines[lineIdx]?.id ?? null,
      categoryConfidence: o.category_confidence,
      reviewerNotes: o.reviewer_notes,
    };
  }
}
