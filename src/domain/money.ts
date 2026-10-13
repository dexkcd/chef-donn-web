/**
 * Money is always integer centavos (₱1.00 = 100). Never floats — same rule as the Android
 * apps' `priceCents: Long`. Percentages are basis points (12% = 1200).
 */
export type Cents = number;
export type BasisPoints = number;

export const PESO = 100;

export function assertCents(value: number, label = "amount"): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be whole centavos, got ${value}`);
  }
  return value;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Round half away from zero, the way people round money on paper. */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < BigInt(0) !== denominator < BigInt(0);
  const n = numerator < BigInt(0) ? -numerator : numerator;
  const d = denominator < BigInt(0) ? -denominator : denominator;
  const q = (n * BigInt(2) + d) / (d * BigInt(2));
  return negative ? -q : q;
}

/** cents × bp / 10 000, rounded half-up. BigInt inside so large budgets never lose precision. */
export function mulBp(cents: Cents, bp: BasisPoints): Cents {
  return Number(divRoundHalfUp(BigInt(cents) * BigInt(bp), BigInt(10_000)));
}

/** Ratio of two amounts as basis points (e.g. contingency left as % of planned). */
export function ratioBp(part: Cents, whole: Cents): BasisPoints | null {
  if (whole === 0) return null;
  return Number(divRoundHalfUp(BigInt(part) * BigInt(10_000), BigInt(whole)));
}

/** Round to the nearest ₱100 — used for template estimates so they read as estimates. */
export function roundToHundredPesos(cents: Cents): Cents {
  return Number(divRoundHalfUp(BigInt(cents), BigInt(100 * PESO))) * 100 * PESO;
}

const PESO_INPUT = /^(\d{1,3}(?:,\d{3})+|\d+)?(?:\.(\d{0,2}))?$/;

/**
 * Parse what a person (or the AI, as a decimal string) types: "1,234.50", "₱1234.5", "PHP 80".
 * Returns null for anything ambiguous — the UI asks again instead of guessing.
 */
export function parsePeso(input: string): Cents | null {
  const trimmed = input.trim().replace(/^(₱|php|p)\s*/i, "");
  if (trimmed === "") return null;
  const match = PESO_INPUT.exec(trimmed);
  if (!match) return null;
  const [, whole, frac] = match;
  if (whole === undefined && (frac === undefined || frac === "")) return null;
  const pesos = Number((whole ?? "0").replace(/,/g, ""));
  const centavos = Number((frac ?? "").padEnd(2, "0") || "0");
  const cents = pesos * PESO + centavos;
  return Number.isSafeInteger(cents) ? cents : null;
}

function groupThousands(n: bigint): string {
  const s = n.toString();
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "₱1,234.56"; negatives as "−₱1,234.56" (true minus sign, readable in IBM Plex Mono). */
export function formatPeso(cents: Cents, opts: { signed?: boolean; noCentavos?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = BigInt(Math.abs(cents));
  const pesos = abs / BigInt(PESO);
  const centavos = abs % BigInt(PESO);
  const body = opts.noCentavos
    ? `₱${groupThousands(divRoundHalfUp(abs, BigInt(PESO)))}`
    : `₱${groupThousands(pesos)}.${centavos.toString().padStart(2, "0")}`;
  if (negative) return `−${body}`;
  if (opts.signed && cents > 0) return `+${body}`;
  return body;
}

/** Compact form for chart labels only: ₱1.2M, ₱350K, ₱900. */
export function formatPesoCompact(cents: Cents): string {
  const negative = cents < 0;
  const pesos = Math.abs(cents) / PESO;
  let body: string;
  if (pesos >= 1_000_000) body = `₱${trimZero((pesos / 1_000_000).toFixed(1))}M`;
  else if (pesos >= 10_000) body = `₱${Math.round(pesos / 1_000)}K`;
  else if (pesos >= 1_000) body = `₱${trimZero((pesos / 1_000).toFixed(1))}K`;
  else body = `₱${Math.round(pesos)}`;
  return negative ? `−${body}` : body;
}

function trimZero(s: string): string {
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Basis points → "12%" / "12.5%". */
export function formatBp(bp: BasisPoints): string {
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  if (frac === 0) return `${whole}%`;
  return `${bp < 0 && whole === 0 ? "-" : ""}${whole}.${frac.toString().padStart(2, "0").replace(/0$/, "")}%`;
}
