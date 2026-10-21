import { env } from "@/server/env";
import { AnthropicPlanDrafter } from "./anthropic";
import { FakePlanDrafter } from "./fake";
import { PlanDraftUnavailableError, type PlanDrafter } from "./types";

class NullPlanDrafter implements PlanDrafter {
  readonly name = "null";
  async draft(): Promise<never> {
    throw new PlanDraftUnavailableError("AI drafting is off — set ANTHROPIC_API_KEY to turn it on.");
  }
}

export function planDrafter(): PlanDrafter {
  const choice = env.aiPlanner ?? (env.anthropicApiKey ? "anthropic" : "null");
  if (choice === "fake") return new FakePlanDrafter();
  if (choice === "anthropic" && env.anthropicApiKey) return new AnthropicPlanDrafter(env.planModel);
  return new NullPlanDrafter();
}

/** Whether the app can offer AI drafting at all (for the UI). */
export function planDraftingOn(): boolean {
  return planDrafter().name !== "null";
}
