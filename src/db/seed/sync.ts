import { sql } from "drizzle-orm";
import type { Executor } from "../client";
import { taskTemplate } from "../schema";
import { allTemplates, seedErrors } from "./roadmap";

/** Upsert every roadmap template. Idempotent; run after migrations on every deploy. */
export async function syncTemplates(exec: Executor): Promise<number> {
  const errors = seedErrors();
  if (errors.length > 0) throw new Error(`Roadmap seed is invalid:\n${errors.join("\n")}`);
  const rows = allTemplates().map((t) => ({
    key: t.key,
    setVersion: t.setVersion,
    municipalityCode: t.municipalityCode,
    stage: t.stage,
    area: t.area,
    sort: t.sort,
    title: t.title,
    body: t.body,
    dependsOn: t.dependsOn,
    costMinCents: t.costMinCents,
    costMaxCents: t.costMaxCents,
    typicalDays: t.typicalDays,
    categoryKey: t.categoryKey,
    verification: t.verification,
    verifiedBy: t.verifiedBy,
    verifiedOn: t.verifiedOn,
    source: t.source,
  }));
  await exec
    .insert(taskTemplate)
    .values(rows)
    .onConflictDoUpdate({
      target: taskTemplate.key,
      set: {
        setVersion: sql`excluded.set_version`,
        municipalityCode: sql`excluded.municipality_code`,
        stage: sql`excluded.stage`,
        area: sql`excluded.area`,
        sort: sql`excluded.sort`,
        title: sql`excluded.title`,
        body: sql`excluded.body`,
        dependsOn: sql`excluded.depends_on`,
        costMinCents: sql`excluded.cost_min_cents`,
        costMaxCents: sql`excluded.cost_max_cents`,
        typicalDays: sql`excluded.typical_days`,
        categoryKey: sql`excluded.category_key`,
        verification: sql`excluded.verification`,
        verifiedBy: sql`excluded.verified_by`,
        verifiedOn: sql`excluded.verified_on`,
        source: sql`excluded.source`,
        updatedAt: sql`now()`,
      },
    });
  return rows.length;
}
