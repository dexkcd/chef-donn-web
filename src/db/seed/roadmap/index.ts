import { templateGraphErrors } from "@/domain/roadmap";
import { GENERIC_PH_V1 } from "./generic-ph.v1";
import { SAN_VICENTE_PORT_BARTON_V1 } from "./san-vicente-port-barton.v1";
import { templateSchema, type Template, type TemplateSet } from "./types";

export const TEMPLATE_SETS: readonly TemplateSet[] = [GENERIC_PH_V1, SAN_VICENTE_PORT_BARTON_V1];

export interface ResolvedTemplate extends Template {
  setVersion: string;
  municipalityCode: string | null;
}

/** Every template, validated. Throws if a seed file is malformed. */
export function allTemplates(): ResolvedTemplate[] {
  return TEMPLATE_SETS.flatMap((set) =>
    set.templates.map((t) => ({ ...templateSchema.parse(t), setVersion: set.setVersion, municipalityCode: set.municipalityCode })),
  );
}

/** Templates that apply to a restaurant in this municipality: national + local. */
export function templatesFor(municipalityCode: string): ResolvedTemplate[] {
  const applicable = allTemplates().filter((t) => t.municipalityCode === null || t.municipalityCode === municipalityCode);
  const keys = new Set(applicable.map((t) => t.key));
  // A national step can't wait on a local one that isn't loaded here.
  return applicable.map((t) => ({ ...t, dependsOn: t.dependsOn.filter((d) => keys.has(d)) }));
}

export function seedErrors(): string[] {
  const errors = templateGraphErrors(allTemplates());
  for (const code of ["PH-PLW-SANVICENTE", "PH-OTHER"]) {
    errors.push(...templateGraphErrors(templatesFor(code)).map((e) => `${code}: ${e}`));
  }
  return errors;
}

export const MUNICIPALITIES: { code: string; name: string }[] = [
  { code: "PH-PLW-SANVICENTE", name: "San Vicente, Palawan" },
];
