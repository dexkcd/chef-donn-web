import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can } from "@/domain/permissions";
import { requireMember } from "@/server/viewer";
import { PageHeader } from "@/ui/kit";
import { CaptureForm } from "./capture-form";

export const metadata: Metadata = { title: "Add a receipt" };

export default async function CapturePage() {
  const v = await requireMember();
  if (!can(v.principal.actor.role, "receipt.capture")) redirect("/receipts");
  return (
    <div>
      <PageHeader title="Add a receipt" back={{ href: "/receipts", label: "Receipts" }} subtitle="Flat on a table, all four corners in the photo, total readable." />
      <CaptureForm />
    </div>
  );
}
