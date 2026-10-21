"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { after } from "next/server";
import { planDraftingOn } from "@/lib/ai/plan";
import type { FormState } from "@/ui/form";
import { runPlanDraft } from "../jobs/plan-draft";
import { requestPlanDraft, requestPlanInput } from "../services/ai-plan";
import { onboard, onboardInput, setTaskEstimate, setTaskStatus, taskEstimateInput, taskStatusInput } from "../services/roadmap";
import { act } from "../viewer";
import { int, optPeso, optStr, peso, str, toFormState } from "./form";
import { ANSWER_FIELDS, answersFromForm } from "./plan-answers";

export async function onboardAction(_prev: FormState, fd: FormData): Promise<FormState> {
  // Check the planning answers first, so a typo doesn't leave the roadmap half set up.
  const answers = answersFromForm(fd);
  const checked = requestPlanInput.safeParse({ answers });
  if (!checked.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of checked.error.issues) fieldErrors[ANSWER_FIELDS[issue.path.join(".")] ?? "notes"] ??= issue.message;
    return { ok: false, reason: Object.values(fieldErrors)[0] ?? "Check the answers.", fieldErrors, at: Date.now() };
  }
  const contingencyPct = int(fd, "contingencyPct");
  const r = await act(
    "profile.edit",
    onboardInput,
    {
      name: str(fd, "name"),
      concept: str(fd, "concept"),
      startingPoint: str(fd, "startingPoint"),
      targetOpeningDate: optStr(fd, "targetOpeningDate"),
      totalBudgetCents: optPeso(fd, "totalBudget"),
      contingencyBp: contingencyPct === null || contingencyPct === undefined ? 1200 : contingencyPct * 100,
    },
    onboard,
  );
  if (!r.ok) return toFormState(r, undefined, { contingencyBp: "contingencyPct" });
  revalidatePath("/", "layout");
  // With AI on, Claude drafts every line from the answers; the owner reviews before anything
  // changes. Replace, so Back doesn't land on a stale copy of this form.
  if (planDraftingOn()) {
    const draft = await act("plan.draft", requestPlanInput, { answers: checked.data.answers }, requestPlanDraft);
    if (draft.ok) {
      after(() => runPlanDraft(draft.data.id).catch((e) => console.error("[plan] draft run failed", e)));
      redirect(`/plan/${draft.data.id}`, RedirectType.replace);
    }
  }
  redirect("/", RedirectType.replace);
}

export async function setTaskStatusAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("task.set_status", taskStatusInput, { taskId: str(fd, "taskId"), status: str(fd, "status") }, setTaskStatus);
  return toFormState(r);
}

export async function setTaskEstimateAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act(
    "task.edit",
    taskEstimateInput,
    {
      taskId: str(fd, "taskId"),
      estimateCents: peso(fd, "estimate") ?? 0,
      categoryKey: str(fd, "categoryKey") || undefined,
      priceSearchId: str(fd, "priceSearchId") || undefined,
    },
    setTaskEstimate,
  );
  return toFormState(r, "Estimate saved — the budget line moved with it.");
}
