/**
 * The facts Claude needs to draft the budget. Shared by onboarding and "Redo the AI setup",
 * which comes prefilled with the last answers. Field names match answersFromForm().
 */
import { OWNED_ITEMS, OWNED_LABELS, SPACE_LABELS, SPACE_STATUSES, type PlanAnswers } from "@/domain/plan";
import { MoneyField, SelectField, TextArea, TextField } from "./form";

export function PlanQuestions({ defaults }: { defaults: PlanAnswers }) {
  const d = defaults;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <TextField name="seats" label="Seats" type="number" inputMode="numeric" min={0} defaultValue={d.seats ?? ""} />
        <TextField name="staff" label="Staff at opening" type="number" inputMode="numeric" min={0} defaultValue={d.staffAtOpening ?? ""} />
      </div>
      <SelectField name="space" label="The space" defaultValue={d.space ?? ""}>
        <option value="">Not sure yet</option>
        {SPACE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {SPACE_LABELS[s]}
          </option>
        ))}
      </SelectField>
      <MoneyField name="rent" label="Rent per month" defaultCents={d.rentMonthlyCents} hint="Leave blank if you own the place or don't know yet." />
      <div className="grid grid-cols-2 gap-3">
        <TextField name="depositMonths" label="Deposit (months)" type="number" inputMode="numeric" min={0} defaultValue={d.depositMonths ?? ""} />
        <TextField name="advanceMonths" label="Advance (months)" type="number" inputMode="numeric" min={0} defaultValue={d.advanceMonths ?? ""} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1 text-[14px] text-ink-2">Already have</legend>
        <div className="grid grid-cols-2 gap-2">
          {OWNED_ITEMS.map((item) => (
            <label
              key={item}
              className="flex min-h-[56px] cursor-pointer items-center gap-3 rounded-md border-[1.5px] border-ink bg-surface px-3 py-2 has-[:checked]:border-[3px] has-[:checked]:border-green has-[:checked]:bg-[#e6f3ec]"
            >
              <input type="checkbox" name="alreadyHave" value={item} defaultChecked={d.alreadyHave.includes(item)} className="size-5 accent-[#0f4d3a]" />
              <span className="font-semibold">{OWNED_LABELS[item]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextArea
        name="notes"
        label="Anything else"
        defaultValue={d.notes}
        maxLength={2000}
        placeholder="e.g. beach-side seafood grill, open-air, need a water tank, we'll do our own fit-out with a local contractor"
      />
    </div>
  );
}
