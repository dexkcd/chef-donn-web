/**
 * Every status shows glyph + colour + label (never colour alone), the same rule as the
 * kitchen tickets on Android. Glyph shapes stay distinct for colour-blind readers.
 */
export type StatusTone =
  | "planned"
  | "committed"
  | "paid"
  | "queued"
  | "reading"
  | "review"
  | "confirmed"
  | "rejected"
  | "failed"
  | "done"
  | "available"
  | "in_progress"
  | "blocked"
  | "skipped"
  | "unverified"
  | "verified"
  | "estimate"
  | "ai_estimate"
  | "found_online"
  | "over"
  | "ok";

export const STATUS: Record<StatusTone, { glyph: string; label: string; className: string }> = {
  planned: { glyph: "○", label: "Planned", className: "bg-wash text-ink border-line" },
  committed: { glyph: "●", label: "Committed", className: "bg-gold text-ink border-gold-deep" },
  paid: { glyph: "✓", label: "Paid", className: "bg-green-bright text-white border-green" },
  queued: { glyph: "▲", label: "Queued", className: "bg-orange text-white border-orange" },
  reading: { glyph: "▲", label: "Reading", className: "bg-orange text-white border-orange" },
  review: { glyph: "●", label: "Needs review", className: "bg-gold text-ink border-gold-deep" },
  confirmed: { glyph: "✓", label: "Confirmed", className: "bg-green-bright text-white border-green" },
  rejected: { glyph: "✕", label: "Rejected", className: "bg-red text-white border-red-deep" },
  failed: { glyph: "✕", label: "Couldn't read", className: "bg-red text-white border-red-deep" },
  done: { glyph: "✓", label: "Done", className: "bg-green-bright text-white border-green" },
  available: { glyph: "▶", label: "Can start", className: "bg-green text-white border-green-deep" },
  in_progress: { glyph: "▲", label: "In progress", className: "bg-orange text-white border-orange" },
  blocked: { glyph: "■", label: "Waiting", className: "bg-faint text-white border-muted" },
  skipped: { glyph: "—", label: "Skipped", className: "bg-wash text-muted border-line" },
  unverified: { glyph: "●", label: "Unverified", className: "bg-gold-wash text-ink border-gold" },
  verified: { glyph: "✓", label: "Verified", className: "bg-green text-white border-green-deep" },
  estimate: { glyph: "▲", label: "Estimate — set yours", className: "bg-gold-wash text-ink border-gold" },
  ai_estimate: { glyph: "●", label: "AI estimate — unverified", className: "bg-gold-wash text-ink border-gold" },
  found_online: { glyph: "●", label: "Found online — confirm", className: "bg-gold-wash text-ink border-gold" },
  over: { glyph: "▲", label: "Over plan", className: "bg-red text-white border-red-deep" },
  ok: { glyph: "✓", label: "On plan", className: "bg-green-bright text-white border-green" },
};
