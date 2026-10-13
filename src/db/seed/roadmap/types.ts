import { z } from "zod";
import { STAGES } from "@/domain/roadmap";

const peso = (n: number) => n * 100;
export { peso };

/** Every cost range in the seed is a placeholder until someone replaces it with a real figure. */
export const PLACEHOLDER_SOURCE = "Placeholder estimate — replace with a quote, a price search, or what you actually paid.";

export const templateSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9_.]+$/),
    stage: z.enum(STAGES),
    area: z.string().min(1),
    sort: z.number().int(),
    title: z.string().min(3),
    body: z.string().min(3),
    dependsOn: z.array(z.string()).default([]),
    costMinCents: z.number().int().nonnegative().nullable().default(null),
    costMaxCents: z.number().int().nonnegative().nullable().default(null),
    typicalDays: z.number().int().positive().nullable().default(null),
    categoryKey: z.string().nullable().default(null),
    verification: z.enum(["unverified", "verified"]).default("unverified"),
    verifiedBy: z.string().nullable().default(null),
    verifiedOn: z.string().nullable().default(null),
    source: z.string().nullable().default(null),
  })
  .refine((t) => (t.costMinCents === null) === (t.costMaxCents === null), "cost range needs both ends")
  .refine((t) => t.costMinCents === null || t.costMaxCents === null || t.costMinCents <= t.costMaxCents, "cost min > max")
  .refine((t) => t.costMinCents === null || t.categoryKey !== null, "a cost needs a budget category")
  .refine((t) => t.verification === "unverified" || (t.verifiedBy && t.verifiedOn && t.source), "verified needs who, when and source");

export type TemplateSeed = z.input<typeof templateSchema>;
export type Template = z.output<typeof templateSchema>;

export interface TemplateSet {
  setVersion: string;
  /** null = applies everywhere in the Philippines. */
  municipalityCode: string | null;
  templates: TemplateSeed[];
}
