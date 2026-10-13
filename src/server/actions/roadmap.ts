"use server";

import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import type { FormState } from "@/ui/form";
import { onboard, onboardInput, setTaskEstimate, setTaskStatus, taskEstimateInput, taskStatusInput } from "../services/roadmap";
import { act } from "../viewer";
import { int, optPeso, optStr, peso, str, toFormState } from "./form";

export async function onboardAction(_prev: FormState, fd: FormData): Promise<FormState> {
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
  // Replace, so Back doesn't land on a stale copy of this form (resubmitting it would put the
  // old figures back). Later edits happen in Settings → Restaurant profile.
  revalidatePath("/", "layout");
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
