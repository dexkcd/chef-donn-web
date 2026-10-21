/** Form fields of the AI-planning questions → raw answers for planAnswersSchema. */
import { int, optPeso, str } from "./form";

export function answersFromForm(fd: FormData) {
  const n = (name: string) => int(fd, name) ?? null;
  return {
    seats: n("seats"),
    space: str(fd, "space") || null,
    rentMonthlyCents: optPeso(fd, "rent") ?? null,
    depositMonths: n("depositMonths"),
    advanceMonths: n("advanceMonths"),
    alreadyHave: fd.getAll("alreadyHave").map(String),
    staffAtOpening: n("staff"),
    notes: str(fd, "notes") ?? "",
  };
}

/** Validation paths (answers.rentMonthlyCents) → input names (rent). */
export const ANSWER_FIELDS: Record<string, string> = {
  "answers.seats": "seats",
  "answers.space": "space",
  "answers.rentMonthlyCents": "rent",
  "answers.depositMonths": "depositMonths",
  "answers.advanceMonths": "advanceMonths",
  "answers.alreadyHave": "alreadyHave",
  "answers.staffAtOpening": "staff",
  "answers.notes": "notes",
};
