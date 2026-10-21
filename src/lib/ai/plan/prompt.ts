import { formatBp, formatPeso } from "@/domain/money";
import { OWNED_LABELS, SPACE_LABELS } from "@/domain/plan";
import { codesFor } from "./output";
import type { PlanContext } from "./types";

export const PLAN_PROMPT_VERSION = "plan.v1";

export const PLAN_SYSTEM = `You draft the opening budget for a first-time restaurant owner in the Philippines. You propose amounts; the owner reviews every proposal and applies only the ones they accept.

Rules:
- Amounts are Philippine pesos as plain decimal strings, e.g. "650000.00" — no "₱", no thousands separators.
- Use realistic current Philippine prices for the place given. Remote places (e.g. Port Barton, Palawan) need freight or boat delivery from Puerto Princesa or Manila — include it where it applies and say so in the reason.
- Use only the codes given: tasks T…, budget lines L…, categories C…. Never invent roadmap tasks, permits, fees or legal requirements; the permit and registration tasks already exist and you only estimate their cost.
- task_estimates: an amount for each task whose cost you can estimate better from the owner's answers. Use "0.00" for things the owner already has, and say so. Leave out tasks you can't improve on.
- line_changes: only for existing lines (L…) whose amount should change.
- new_lines: real costs that no task or line covers yet (for example water tank and pump, uniforms, smallwares, signage, first month's LPG). Pick the best category; a short, specific description. Don't duplicate anything a task or line already covers.
- Aim for estimates plus the contingency percentage to fit within the total the owner can spend. If the essentials can't fit, say so in the summary instead of zeroing needed items.
- reason: one short sentence the owner can check — quantities, sizes, the price basis.
- summary: two or three sentences. assumptions: what you assumed that the owner didn't say. check: what the owner should get a quote for or confirm locally (for example at the municipal offices).
- These are estimates, not quotes. Never name a supplier's price as if you had checked it.`;

const peso = (c: number | null) => (c === null ? "not set" : formatPeso(c, { noCentavos: true }));

export function planContextText(ctx: PlanContext): string {
  const c = codesFor(ctx);
  const r = ctx.restaurant;
  const a = ctx.answers;
  const catCode = (id: string | null) => (id ? c.categories[ctx.categories.findIndex((x) => x.id === id)] ?? "?" : "-");
  const facts = [
    `Restaurant: ${r.name}${r.concept ? ` — ${r.concept}` : ""}`,
    `Place: ${r.place}`,
    `Stage: ${r.startingPoint}; target opening: ${r.targetOpeningDate ?? "not set"}; today: ${ctx.today}`,
    `Total the owner can spend before opening: ${peso(r.totalBudgetCents)}; contingency: ${formatBp(r.contingencyBp)} of estimates`,
    `Seats: ${a.seats ?? "not said"}`,
    `The space: ${a.space ? SPACE_LABELS[a.space] : "not said"}`,
    `Rent per month: ${peso(a.rentMonthlyCents)}; deposit months: ${a.depositMonths ?? "not said"}; advance months: ${a.advanceMonths ?? "not said"}`,
    `Already has: ${a.alreadyHave.length > 0 ? a.alreadyHave.map((x) => OWNED_LABELS[x]).join(", ") : "nothing listed"}`,
    `Staff at opening: ${a.staffAtOpening ?? "not said"}`,
  ];
  const cats = ctx.categories.map((x, i) => `${c.categories[i]}: ${x.name}${x.hint ? ` (${x.hint})` : ""}${x.kind === "working_capital" ? " [after opening]" : ""}`);
  const tasks = ctx.tasks.map(
    (t, i) =>
      `${c.tasks[i]}: ${t.title} [${catCode(t.categoryId)}; ${t.stage}; ${t.status}] now ${peso(t.currentCents)}${t.minCents !== null && t.maxCents !== null ? ` (generic range ${peso(t.minCents)}–${peso(t.maxCents)})` : ""}${t.basis === "owner" ? " — set by the owner" : t.basis === "price_search" ? " — from a price search" : ""}`,
  );
  const lines = ctx.lines.map((l, i) => `${c.lines[i]}: ${l.description} [${catCode(l.categoryId)}] ${peso(l.plannedCents)}`);
  return [
    "About the restaurant:",
    ...facts.map((f) => `- ${f}`),
    "",
    "In the owner's own words:",
    a.notes ? a.notes : "(nothing added)",
    "",
    "Budget categories:",
    ...cats,
    "",
    "Roadmap tasks with a cost:",
    ...(tasks.length > 0 ? tasks : ["(none)"]),
    "",
    "Other budget lines:",
    ...(lines.length > 0 ? lines : ["(none)"]),
    "",
    "Draft the budget.",
  ].join("\n");
}
