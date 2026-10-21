import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { EMPTY_ANSWERS } from "@/domain/plan";
import { STARTING_POINT_LABELS, STARTING_POINTS } from "@/domain/roadmap";
import { planDraftingOn } from "@/lib/ai/plan";
import { onboardAction } from "@/server/actions/roadmap";
import { loadProfile } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ActionForm, ChoiceCards, MoneyField, Submit, TextArea, TextField } from "@/ui/form";
import { TOTAL_HINT } from "@/ui/hints";
import { PlanQuestions } from "@/ui/plan-questions";

export const metadata: Metadata = { title: "Set up" };

const HINTS: Record<(typeof STARTING_POINTS)[number], string> = {
  idea: "Concept, budget and finding a place come first.",
  found_place: "Check the site can be permitted before you sign.",
  building: "Lease signed — permits, fit-out and equipment now.",
  about_to_open: "Menu, suppliers, POS, team and launch.",
  open: "Already trading — fill in what's missing.",
};

export default async function OnboardingPage() {
  const v = await requireMember();
  const role = v.principal.actor.role;
  if (role !== "owner" && role !== "partner") redirect("/");
  const profile = await loadProfile(db, v.principal.workspaceId);
  if (profile.onboardedAt) redirect("/settings/profile");
  const ai = planDraftingOn();

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <div className="label text-green">Chef Donn&rsquo;s · set up</div>
      <h1 className="display mt-1 text-[32px]">Where are you now?</h1>
      <p className="mt-2 text-muted">
        We&rsquo;ll build your roadmap and a first budget for {profile.barangay}, {profile.municipalityName}. Every cost starts as a labelled estimate you replace with real numbers.
      </p>
      <ActionForm action={onboardAction} className="mt-6">
        <TextField name="name" label="Restaurant name" defaultValue={profile.name === "My restaurant" ? "" : profile.name} placeholder="e.g. Kusina sa Port Barton" required />
        <div className="flex flex-col gap-1">
          <span className="label text-[14px] text-ink-2">Where you are</span>
          <ChoiceCards
            name="startingPoint"
            defaultValue={profile.startingPoint}
            options={STARTING_POINTS.map((s) => ({ value: s, label: STARTING_POINT_LABELS[s], hint: HINTS[s] }))}
          />
        </div>
        <TextField name="targetOpeningDate" label="Target opening date" type="date" defaultValue={profile.targetOpeningDate ?? ""} hint="A rough date is fine — it drives the runway." />
        <MoneyField name="totalBudget" label="Total you can spend to open" defaultCents={profile.totalBudgetCents} hint={TOTAL_HINT} />
        <TextField name="contingencyPct" label="Contingency %" type="number" inputMode="numeric" min={0} max={50} defaultValue={profile.contingencyBp / 100} hint="Overruns come out of this, visibly. 10–15% is common." />
        <TextArea name="concept" label="Concept (optional)" defaultValue={profile.concept ?? ""} placeholder="Grilled seafood and Filipino comfort food for divers and backpackers" />
        {ai && (
          <section className="mt-2 flex flex-col gap-3 border-t-[3px] border-ink pt-5">
            <h2 className="display text-[22px]">So Claude can draft your budget</h2>
            <p className="text-muted">
              Claude estimates every line from these answers — kitchen, fit-out, permits, deposit, the lot. You check every amount before it goes on the budget. Skip anything you don&rsquo;t know yet.
            </p>
            <PlanQuestions defaults={{ ...EMPTY_ANSWERS, seats: profile.seats }} />
          </section>
        )}
        <Submit pendingLabel={ai ? "Building your roadmap and drafting…" : "Building your roadmap…"}>{ai ? "Build my roadmap and draft the budget" : "Build my roadmap"}</Submit>
      </ActionForm>
    </main>
  );
}
