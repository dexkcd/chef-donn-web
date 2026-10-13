/** Helpers for turning FormData into typed action input, and action results into form state. */
import { revalidatePath } from "next/cache";
import { parsePesoInput } from "@/domain/money";
import type { FormState } from "@/ui/form";
import type { ActionResult } from "../context";
import { toInputFieldErrors } from "./field-errors";

export function str(fd: FormData, name: string): string | undefined {
  const v = fd.get(name);
  return typeof v === "string" ? v : undefined;
}

/** Empty → null; otherwise the trimmed string. */
export function optStr(fd: FormData, name: string): string | null | undefined {
  const v = str(fd, name);
  if (v === undefined) return undefined;
  return v.trim() === "" ? null : v.trim();
}

/** Pesos as typed → centavos. Invalid text becomes NaN so validation shows a friendly message. */
export function peso(fd: FormData, name: string): number | undefined {
  const v = str(fd, name);
  if (v === undefined || v.trim() === "") return undefined;
  return parsePesoInput(v) ?? Number.NaN;
}

export function optPeso(fd: FormData, name: string): number | null | undefined {
  const v = str(fd, name);
  if (v === undefined) return undefined;
  if (v.trim() === "") return null;
  return parsePesoInput(v) ?? Number.NaN;
}

export function int(fd: FormData, name: string): number | null | undefined {
  const v = str(fd, name);
  if (v === undefined) return undefined;
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : Number.NaN;
}

/**
 * Map an action result to form state, refreshing every page's data on success. Field errors
 * are re-keyed to the form's input names (`totalBudgetCents` → `totalBudget`, plus `rename`).
 */
export function toFormState<T>(r: ActionResult<T>, message?: string, rename?: Record<string, string>): FormState {
  if (r.ok) {
    revalidatePath("/", "layout");
    return { ok: true, message, at: Date.now() };
  }
  return { ok: false, reason: r.reason, fieldErrors: toInputFieldErrors(r.fieldErrors, rename), at: Date.now() };
}
