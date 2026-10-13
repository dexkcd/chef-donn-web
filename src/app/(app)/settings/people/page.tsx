import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { formatDate } from "@/domain/dates";
import { can, ROLE_LABELS, ROLES } from "@/domain/permissions";
import { changeRoleAction, inviteAction, revokeInviteAction } from "@/server/actions/settings";
import { listMembers } from "@/server/services/members";
import { requireMember } from "@/server/viewer";
import { ActionForm, SelectField, Submit, TextField } from "@/ui/form";
import { Card, PageHeader, SectionTitle } from "@/ui/kit";

export const metadata: Metadata = { title: "People" };

const ROLE_HINTS = {
  owner: "Everything",
  partner: "Everything",
  helper: "Add receipts, notes and task updates; no budget changes",
  bookkeeper: "Read-only, can download CSVs",
} as const;

export default async function PeoplePage() {
  const v = await requireMember();
  if (!can(v.principal.actor.role, "members.manage")) redirect("/settings");
  const { members, invites } = await listMembers(db, v.principal.workspaceId);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="People" back={{ href: "/settings", label: "More" }} />
      <Card>
        <SectionTitle>In this restaurant</SectionTitle>
        <ul className="divide-y-[1.5px] divide-line">
          {members.map((m) => (
            <li key={m.id} className="py-2">
              <div className="font-semibold">{m.name || m.email}</div>
              <div className="text-[14px] text-muted">{m.email}</div>
              {m.userId === v.principal.actor.userId ? (
                <div className="label mt-1 text-[13px] text-green">{ROLE_LABELS[m.role]} · you</div>
              ) : (
                <ActionForm action={changeRoleAction} className="mt-2 !gap-2">
                  <input type="hidden" name="membershipId" value={m.id} />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <SelectField name="role" label="Role" defaultValue={m.role}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="self-end">
                      <Submit variant="secondary" block={false}>
                        Save
                      </Submit>
                    </div>
                  </div>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {invites.length > 0 && (
        <Card>
          <SectionTitle>Invited</SectionTitle>
          <ul className="divide-y-[1.5px] divide-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="block font-semibold">{i.email}</span>
                  <span className="text-[14px] text-muted">
                    {ROLE_LABELS[i.role]} · expires {formatDate(i.expiresAt.toISOString().slice(0, 10))}
                  </span>
                </span>
                <ActionForm action={revokeInviteAction} className="!gap-1">
                  <input type="hidden" name="invitationId" value={i.id} />
                  <Submit variant="ghost" block={false}>
                    Revoke
                  </Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle>Invite someone</SectionTitle>
        <ActionForm action={inviteAction} resetOnSuccess>
          <TextField name="email" label="Email" type="email" inputMode="email" autoComplete="off" />
          <SelectField name="role" label="Role" defaultValue="helper">
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]} — {ROLE_HINTS[r]}
              </option>
            ))}
          </SelectField>
          <Submit>Send invitation</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
