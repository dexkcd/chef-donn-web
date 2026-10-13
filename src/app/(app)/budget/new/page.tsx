import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { can } from "@/domain/permissions";
import { createLineAction } from "@/server/actions/budget";
import { loadCategories } from "@/server/services/budget-data";
import { requireMember } from "@/server/viewer";
import { ActionForm, MoneyField, SelectField, Submit, TextField } from "@/ui/form";
import { PageHeader } from "@/ui/kit";

export const metadata: Metadata = { title: "New budget line" };

export default async function NewLinePage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const v = await requireMember();
  if (!can(v.principal.actor.role, "line.create")) redirect("/budget");
  const { category } = await searchParams;
  const cats = (await loadCategories(db, v.principal.workspaceId)).filter((c) => c.kind !== "contingency" && !c.archivedAt);
  return (
    <div>
      <PageHeader title="New budget line" back={{ href: category ? `/budget/${category}` : "/budget", label: "Budget" }} subtitle="One cost you expect: a deposit, a fridge, a permit fee." />
      <ActionForm action={createLineAction}>
        <SelectField name="categoryId" label="Category" defaultValue={category ?? ""} required>
          <option value="" disabled>
            Pick a category
          </option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField name="description" label="What is it" placeholder="Two-door chiller" required />
        <MoneyField name="planned" label="Planned" placeholder="45,000" hint="What you expect to spend." />
        <MoneyField name="committed" label="Committed (optional)" placeholder="0" hint="Already signed, ordered or agreed — even if not paid yet." />
        <TextField name="dueDate" label="Due date (optional)" type="date" hint="Shows up in “Due in the next 14 days”." />
        <TextField name="payeeName" label="Paid to (optional)" placeholder="Supplier or person" />
        <Submit>Add line</Submit>
      </ActionForm>
    </div>
  );
}
