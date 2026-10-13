"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { ROLES } from "@/domain/permissions";
import type { FormState } from "@/ui/form";
import { auth } from "../auth";
import { categoryInput, changeRole, inviteInput, inviteMember, revokeInvitation, saveCategory, setCategoryArchived } from "../services/members";
import { act } from "../viewer";
import { optStr, str, toFormState } from "./form";

export async function inviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const r = await act("members.manage", inviteInput, { email: str(fd, "email"), role: str(fd, "role") }, inviteMember);
  if (!r.ok) return toFormState(r);
  // Send them a sign-in link straight away; they can also just sign in with this email later.
  try {
    await auth.api.signInMagicLink({ body: { email: r.data.email, callbackURL: "/" }, headers: await headers() });
  } catch (e) {
    console.warn("[invite] sign-in link not sent", e);
    return toFormState(r, `Invited ${r.data.email}. The email didn't go out — ask them to sign in with this address.`);
  }
  return toFormState(r, `Invited ${r.data.email} — a sign-in link is on its way.`);
}

export async function revokeInviteAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return toFormState(await act("members.manage", z.object({ invitationId: z.uuid() }), { invitationId: str(fd, "invitationId") }, revokeInvitation), "Invitation revoked.");
}

export async function changeRoleAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return toFormState(
    await act("members.manage", z.object({ membershipId: z.uuid(), role: z.enum(ROLES) }), { membershipId: str(fd, "membershipId"), role: str(fd, "role") }, changeRole),
    "Role changed.",
  );
}

export async function saveCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return toFormState(await act("category.edit", categoryInput, { id: str(fd, "id") || undefined, name: str(fd, "name"), hint: optStr(fd, "hint") }, saveCategory), "Category saved.");
}

export async function archiveCategoryAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const archived = str(fd, "archived") === "1";
  return toFormState(
    await act("category.edit", z.object({ categoryId: z.uuid(), archived: z.boolean() }), { categoryId: str(fd, "categoryId"), archived }, setCategoryArchived),
    archived ? "Category archived." : "Category restored.",
  );
}
