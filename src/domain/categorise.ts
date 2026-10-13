/**
 * Which budget category and line a receipt belongs to.
 *
 * Precedence: a vendor rule learned from this workspace's own confirmations beats the AI.
 * It's the owner's earlier decision, it's deterministic, and it explains itself ("last time
 * you filed Port Barton Hardware under Construction"). The AI suggestion is still shown as
 * an alternative when it disagrees. Nothing here is final — a person confirms.
 */

export interface VendorRuleInput {
  vendorKey: string;
  categoryId: string;
  moneyLineId: string | null;
  hits: number;
}

export interface AiSuggestionInput {
  categoryId: string | null;
  moneyLineId: string | null;
  confidence: "high" | "medium" | "low";
}

export interface CategorySuggestion {
  categoryId: string | null;
  moneyLineId: string | null;
  source: "rule" | "ai" | "none";
  confidence: "high" | "medium" | "low" | null;
  /** The AI's differing opinion, when a rule won. */
  alternative: { categoryId: string; moneyLineId: string | null } | null;
}

export function suggestCategory(args: {
  rule: VendorRuleInput | null;
  ai: AiSuggestionInput | null;
  validCategoryIds: ReadonlySet<string>;
  /** Open lines, with the category each belongs to. */
  validLines: ReadonlyMap<string, string>;
}): CategorySuggestion {
  const { rule, ai, validCategoryIds, validLines } = args;
  const lineIfValid = (lineId: string | null, categoryId: string) =>
    lineId !== null && validLines.get(lineId) === categoryId ? lineId : null;

  const aiCategory = ai?.categoryId && validCategoryIds.has(ai.categoryId) ? ai.categoryId : null;
  const aiLine = aiCategory ? lineIfValid(ai?.moneyLineId ?? null, aiCategory) : null;

  if (rule && validCategoryIds.has(rule.categoryId)) {
    const ruleLine = lineIfValid(rule.moneyLineId, rule.categoryId);
    const disagrees = aiCategory !== null && (aiCategory !== rule.categoryId || (aiLine !== null && aiLine !== ruleLine));
    return {
      categoryId: rule.categoryId,
      moneyLineId: ruleLine,
      source: "rule",
      confidence: rule.hits >= 2 ? "high" : "medium",
      alternative: disagrees && aiCategory ? { categoryId: aiCategory, moneyLineId: aiLine } : null,
    };
  }
  if (aiCategory) {
    return { categoryId: aiCategory, moneyLineId: aiLine, source: "ai", confidence: ai?.confidence ?? null, alternative: null };
  }
  return { categoryId: null, moneyLineId: null, source: "none", confidence: null, alternative: null };
}

const CORPORATE_SUFFIXES = /\b(inc|incorporated|corp|corporation|co|company|ltd|limited|opc|llc)\b\.?/g;

/** Lowercase, drop punctuation and corporate suffixes, collapse spaces. */
export function normaliseVendorName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(CORPORATE_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** TINs are written 123-456-789-000 (last block = branch). Keep the 9-digit taxpayer part. */
export function normaliseTin(tin: string): string | null {
  const digits = tin.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(0, 9) : null;
}

/** Stable key for learning vendor → category: TIN when we have one, otherwise the name. */
export function vendorKey(vendor: { tin?: string | null; name?: string | null }): string | null {
  const tin = vendor.tin ? normaliseTin(vendor.tin) : null;
  if (tin) return `tin:${tin}`;
  const name = vendor.name ? normaliseVendorName(vendor.name) : "";
  return name ? `name:${name}` : null;
}
