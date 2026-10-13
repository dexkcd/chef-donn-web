import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { can } from "@/domain/permissions";
import { archiveCategoryAction, saveCategoryAction } from "@/server/actions/settings";
import { loadCategories } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ActionForm, Submit, TextField } from "@/ui/form";
import { Card, PageHeader, SectionTitle, StatusBadge } from "@/ui/kit";

export const metadata: Metadata = { title: "Budget categories" };

export default async function CategoriesPage() {
  const v = await requireMember();
  if (!can(v.principal.actor.role, "category.edit")) redirect("/settings");
  const cats = await loadCategories(db, v.principal.workspaceId);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Budget categories" back={{ href: "/settings", label: "More" }} />
      {cats.map((c) => (
        <details key={c.id} className="rounded-lg border-[1.5px] border-line bg-surface p-4">
          <summary className="flex cursor-pointer items-center justify-between gap-3">
            <span className="font-semibold">{c.name}</span>
            {c.archivedAt ? <StatusBadge tone="skipped" label="Archived" /> : c.kind !== "normal" ? <StatusBadge tone="planned" label="Built-in" /> : null}
          </summary>
          <ActionForm action={saveCategoryAction} className="mt-3">
            <input type="hidden" name="id" value={c.id} />
            <TextField name="name" label="Name" defaultValue={c.name} />
            <TextField name="hint" label="What goes here" defaultValue={c.hint ?? ""} />
            <Submit variant="secondary">Save</Submit>
          </ActionForm>
          {c.kind === "normal" && (
            <ActionForm action={archiveCategoryAction} className="mt-2">
              <input type="hidden" name="categoryId" value={c.id} />
              <input type="hidden" name="archived" value={c.archivedAt ? "0" : "1"} />
              <Submit variant="ghost">{c.archivedAt ? "Restore" : "Archive"}</Submit>
            </ActionForm>
          )}
        </details>
      ))}
      <Card>
        <SectionTitle>Add a category</SectionTitle>
        <ActionForm action={saveCategoryAction} resetOnSuccess>
          <TextField name="name" label="Name" placeholder="Boat and freight" />
          <TextField name="hint" label="What goes here (optional)" />
          <Submit>Add category</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
