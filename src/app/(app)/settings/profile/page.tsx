import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { can } from "@/domain/permissions";
import { STARTING_POINT_LABELS, STARTING_POINTS } from "@/domain/roadmap";
import { updateProfileAction } from "@/server/actions/budget";
import { loadProfile } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ActionForm, MoneyField, SelectField, Submit, TextArea, TextField } from "@/ui/form";
import { TOTAL_HINT } from "@/ui/hints";
import { PageHeader } from "@/ui/kit";

export const metadata: Metadata = { title: "Restaurant profile" };

export default async function ProfilePage() {
  const v = await requireMember();
  if (!can(v.principal.actor.role, "profile.edit")) redirect("/settings");
  const p = await loadProfile(db, v.principal.workspaceId);
  return (
    <div>
      <PageHeader title="Restaurant profile" back={{ href: "/settings", label: "More" }} subtitle={`${p.barangay}, ${p.municipalityName}`} />
      <ActionForm action={updateProfileAction}>
        <TextField name="name" label="Restaurant name" defaultValue={p.name} />
        <SelectField name="startingPoint" label="Where you are" defaultValue={p.startingPoint} hint="Moves the roadmap's focus.">
          {STARTING_POINTS.map((s) => (
            <option key={s} value={s}>
              {STARTING_POINT_LABELS[s]}
            </option>
          ))}
        </SelectField>
        <TextField name="targetOpeningDate" label="Target opening date" type="date" defaultValue={p.targetOpeningDate ?? ""} />
        <MoneyField name="totalBudget" label="Total you can spend to open" defaultCents={p.totalBudgetCents} hint={TOTAL_HINT} />
        <TextField name="contingencyPct" label="Contingency %" type="number" inputMode="numeric" min={0} max={50} defaultValue={p.contingencyBp / 100} hint="Of everything planned (working-capital reserve excluded)." />
        <TextField name="seats" label="Seats (optional)" type="number" inputMode="numeric" min={0} defaultValue={p.seats ?? ""} />
        <TextArea name="concept" label="Concept" defaultValue={p.concept ?? ""} />
        <Submit>Save profile</Submit>
      </ActionForm>
    </div>
  );
}
