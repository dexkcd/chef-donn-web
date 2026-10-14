"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/ui/form";
import { extractReceipt } from "../jobs/extraction";
import { confirmInput, confirmReceipt, rejectInput, rejectReceipt, retryExtraction, retryExtractionInput } from "../services/receipts";
import { act } from "../viewer";
import { optPeso, optStr, peso, str, toFormState } from "./form";

export async function confirmReceiptAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const lineChoice = str(fd, "moneyLineId");
  const isNew = lineChoice === "__new__";
  const action = isNew ? "receipt.confirm_new_line" : "receipt.confirm_existing_line";
  const r = await act(
    action,
    confirmInput,
    {
      receiptId: str(fd, "receiptId"),
      vendorName: str(fd, "vendorName"),
      vendorTin: optStr(fd, "vendorTin"),
      docNumber: optStr(fd, "docNumber"),
      date: str(fd, "date"),
      totalCents: peso(fd, "total"),
      vatableCents: optPeso(fd, "vatable"),
      vatCents: optPeso(fd, "vat"),
      method: str(fd, "method"),
      moneyLineId: isNew || !lineChoice ? null : lineChoice,
      newLine: isNew ? { categoryId: str(fd, "newLineCategoryId"), description: str(fd, "newLineDescription") } : null,
      confirmed: fd.getAll("confirmed").map(String),
      notDuplicate: str(fd, "notDuplicate") === "1",
    },
    confirmReceipt,
  );
  if (!r.ok) return toFormState(r);
  toFormState(r);
  redirect("/receipts?saved=1");
}

export async function rejectReceiptAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("receipt.reject", rejectInput, { receiptId: str(fd, "receiptId"), reason: str(fd, "reason") }, rejectReceipt);
  if (!r.ok) return toFormState(r);
  toFormState(r);
  redirect("/receipts");
}

export async function retryExtractionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("receipt.capture", retryExtractionInput, { receiptId: str(fd, "receiptId") }, retryExtraction);
  if (r.ok) after(() => extractReceipt(r.data.receiptId).catch((e) => console.error("[receipts] extraction failed", e)));
  return toFormState(r, "Reading it again — this takes a few seconds.");
}
