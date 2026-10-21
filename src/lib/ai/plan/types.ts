import type { CategoryKind } from "@/domain/budget";
import type { PlanAnswers, PlanProposal } from "@/domain/plan";

/** Everything the planner sees. Ids never leave the server — the model gets short codes. */
export interface PlanContext {
  restaurant: {
    name: string;
    concept: string | null;
    place: string;
    startingPoint: string;
    targetOpeningDate: string | null;
    totalBudgetCents: number | null;
    contingencyBp: number;
  };
  answers: PlanAnswers;
  /** Budget categories a cost can go in (contingency excluded — it's automatic). */
  categories: { id: string; name: string; hint: string | null; kind: CategoryKind }[];
  /** Roadmap tasks that carry a cost (have a budget category), not skipped. */
  tasks: { id: string; title: string; stage: string; status: string; categoryId: string | null; lineId: string | null; currentCents: number; minCents: number | null; maxCents: number | null; basis: string | null }[];
  /** Budget lines that aren't tasks or contingency, still open. */
  lines: { id: string; categoryId: string; description: string; plannedCents: number; sourceType: string }[];
  today: string;
}

export interface PlanDraftResult {
  provider: string;
  model: string | null;
  promptVersion: string;
  proposal: PlanProposal;
  raw: unknown;
}

export interface PlanDrafter {
  readonly name: string;
  draft(ctx: PlanContext): Promise<PlanDraftResult>;
}

export class PlanDraftUnavailableError extends Error {}
export class PlanDraftFailed extends Error {}
