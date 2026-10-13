"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/ui/form";
import {
  addTranche,
  createLine,
  createLineInput,
  fundingSourceInput,
  lineIdInput,
  logPayment,
  logPaymentInput,
  profileInput,
  saveFundingSource,
  setLineClosed,
  trancheInput,
  updateLine,
  updateLineInput,
  updateProfile,
  voidLine,
  voidPayment,
  voidPaymentInput,
} from "../services/budget";
import { z } from "zod";
import { act } from "../viewer";
import { int, optPeso, optStr, peso, str, toFormState } from "./form";

export async function createLineAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act(
    "line.create",
    createLineInput,
    {
      categoryId: str(fd, "categoryId"),
      description: str(fd, "description"),
      plannedCents: peso(fd, "planned") ?? 0,
      committedCents: peso(fd, "committed") ?? 0,
      dueDate: optStr(fd, "dueDate"),
      payeeName: optStr(fd, "payeeName"),
    },
    createLine,
  );
  if (!r.ok) return toFormState(r);
  toFormState(r);
  redirect(`/budget/lines/${r.data.id}`);
}

export async function updateLineAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const locked = str(fd, "locked") === "1";
  const r = await act(
    "line.edit",
    updateLineInput,
    {
      lineId: str(fd, "lineId"),
      ...(locked
        ? {}
        : {
            categoryId: str(fd, "categoryId"),
            description: str(fd, "description"),
            plannedCents: peso(fd, "planned") ?? 0,
          }),
      committedCents: peso(fd, "committed") ?? 0,
      dueDate: optStr(fd, "dueDate"),
      payeeName: optStr(fd, "payeeName"),
    },
    updateLine,
  );
  return toFormState(r, "Saved.");
}

export async function setLineClosedAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const closed = str(fd, "closed") === "1";
  const r = await act("line.close", z.object({ lineId: z.uuid(), closed: z.boolean() }), { lineId: str(fd, "lineId"), closed }, setLineClosed);
  return toFormState(r, closed ? "Line closed — anything unspent goes back to contingency." : "Line reopened.");
}

export async function voidLineAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("line.void", lineIdInput, { lineId: str(fd, "lineId"), reason: optStr(fd, "reason") }, voidLine);
  if (!r.ok) return toFormState(r);
  toFormState(r);
  redirect("/budget");
}

export async function logPaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act(
    "payment.log",
    logPaymentInput,
    {
      clientId: str(fd, "clientId") || undefined,
      moneyLineId: str(fd, "moneyLineId"),
      amountCents: peso(fd, "amount"),
      paidOn: str(fd, "paidOn"),
      method: str(fd, "method"),
      payeeName: optStr(fd, "payeeName"),
      referenceNo: optStr(fd, "referenceNo"),
      notes: optStr(fd, "notes"),
      grossCents: optPeso(fd, "gross"),
      withholdingCents: optPeso(fd, "withholding"),
    },
    logPayment,
  );
  return toFormState(r, "Payment logged.");
}

export async function voidPaymentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("payment.void", voidPaymentInput, { paymentId: str(fd, "paymentId"), reason: str(fd, "reason") }, voidPayment);
  return toFormState(r, "Payment voided.");
}

export async function saveFundingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act(
    "funding.edit",
    fundingSourceInput,
    {
      id: str(fd, "id") || undefined,
      type: str(fd, "type"),
      name: str(fd, "name"),
      committedCents: peso(fd, "committed") ?? 0,
      expectedOn: optStr(fd, "expectedOn"),
      notes: optStr(fd, "notes"),
    },
    saveFundingSource,
  );
  return toFormState(r, "Funding saved.");
}

export async function addTrancheAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act(
    "funding.edit",
    trancheInput,
    { fundingSourceId: str(fd, "fundingSourceId"), amountCents: peso(fd, "amount"), receivedOn: str(fd, "receivedOn"), notes: optStr(fd, "notes") },
    addTranche,
  );
  return toFormState(r, "Money received — cash on hand updated.");
}

export async function updateProfileAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const pct = int(fd, "contingencyPct");
  const r = await act(
    "profile.edit",
    profileInput,
    {
      name: str(fd, "name"),
      concept: optStr(fd, "concept"),
      targetOpeningDate: optStr(fd, "targetOpeningDate"),
      totalBudgetCents: optPeso(fd, "totalBudget"),
      contingencyBp: pct === null || pct === undefined ? Number.NaN : pct * 100,
      seats: int(fd, "seats"),
      startingPoint: str(fd, "startingPoint") || undefined,
    },
    updateProfile,
  );
  return toFormState(r, "Profile saved.");
}
