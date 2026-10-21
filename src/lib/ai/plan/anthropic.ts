/** Claude drafts the plan in one structured-output call; a person applies what they accept. */
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { anthropic, FALLBACK_BETA } from "../anthropic-client";
import { planSchemaFor, toProposal } from "./output";
import { PLAN_PROMPT_VERSION, PLAN_SYSTEM, planContextText } from "./prompt";
import { PlanDraftFailed, type PlanContext, type PlanDraftResult, type PlanDrafter } from "./types";

export class AnthropicPlanDrafter implements PlanDrafter {
  readonly name = "anthropic";
  constructor(private readonly model: string) {}

  async draft(ctx: PlanContext): Promise<PlanDraftResult> {
    const res = await anthropic().beta.messages.parse(
      {
        model: this.model,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(planSchemaFor(ctx)) },
        system: PLAN_SYSTEM,
        messages: [{ role: "user", content: planContextText(ctx) }],
      },
      { timeout: 300_000 },
    );
    if (res.stop_reason === "refusal") throw new PlanDraftFailed("The model declined to draft this plan.");
    if (res.stop_reason === "max_tokens") throw new PlanDraftFailed("The plan was too long to draft in one go.");
    const o = res.parsed_output;
    if (!o) throw new PlanDraftFailed("The draft couldn't be read.");
    return { provider: this.name, model: res.model, promptVersion: PLAN_PROMPT_VERSION, proposal: toProposal(o, ctx), raw: { output: o, usage: res.usage } };
  }
}
