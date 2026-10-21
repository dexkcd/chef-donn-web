"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/db/client";
import type { FormState } from "@/ui/form";
import { runPlanDraft } from "../jobs/plan-draft";
import { applyPlanDraft, applyPlanInput, discardPlanDraft, draftIdInput, getPlanDraft, requestPlanDraft, requestPlanInput } from "../services/ai-plan";
import { act, getViewer } from "../viewer";
import { str, toFormState } from "./form";
import { ANSWER_FIELDS, answersFromForm } from "./plan-answers";

function startDraft(id: string) {
  after(() => runPlanDraft(id).catch((e) => console.error("[plan] draft run failed", e)));
}

export async function requestPlanAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("plan.draft", requestPlanInput, { answers: answersFromForm(fd) }, requestPlanDraft);
  if (!r.ok) return toFormState(r, undefined, ANSWER_FIELDS);
  startDraft(r.data.id);
  redirect(`/plan/${r.data.id}`);
}

/** "Try again" on a failed draft: a new draft from the same answers. */
export async function retryPlanAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await getViewer();
  if (v.status !== "member") return { ok: false, reason: "You've been signed out. Sign in again." };
  const prior = await getPlanDraft(db, v.principal.workspaceId, str(fd, "draftId") ?? "");
  if (!prior) return { ok: false, reason: "That draft doesn't exist." };
  const r = await act("plan.draft", requestPlanInput, { answers: prior.answers }, requestPlanDraft);
  if (!r.ok) return toFormState(r);
  startDraft(r.data.id);
  redirect(`/plan/${r.data.id}`);
}

export async function applyPlanAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("plan.apply", applyPlanInput, { draftId: str(fd, "draftId"), itemIds: fd.getAll("item").map(String) }, applyPlanDraft);
  const n = r.ok ? r.data.applied : 0;
  return toFormState(r, `Applied ${n} ${n === 1 ? "change" : "changes"} — the budget moved with them.`);
}

export async function discardPlanAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("plan.apply", draftIdInput, { draftId: str(fd, "draftId") }, discardPlanDraft);
  if (!r.ok) return toFormState(r);
  revalidatePath("/", "layout");
  redirect("/budget");
}
