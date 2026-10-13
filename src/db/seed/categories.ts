/** Default budget categories from the v1 spec §7. Owners can rename, add and archive them. */
import type { CategoryKind } from "@/domain/budget";

export interface CategorySeed {
  key: string;
  name: string;
  kind: CategoryKind;
  hint: string;
}

export const DEFAULT_CATEGORIES: readonly CategorySeed[] = [
  { key: "site", name: "Site", kind: "normal", hint: "Deposit, advance, pre-opening rent" },
  { key: "construction", name: "Construction and fit-out", kind: "normal", hint: "Contractor, materials, labour" },
  { key: "equipment", name: "Equipment", kind: "normal", hint: "Kitchen, refrigeration, generator, safety" },
  { key: "furniture", name: "Furniture and decor", kind: "normal", hint: "Tables, chairs, signage, lighting" },
  { key: "permits", name: "Permits, fees and taxes", kind: "normal", hint: "Barangay, BPLO, BFP, sanitary, BIR" },
  { key: "professional", name: "Professional fees", kind: "normal", hint: "Lawyer, architect/engineer, bookkeeper" },
  { key: "utilities", name: "Utilities setup", kind: "normal", hint: "Power, water, LPG, internet connections" },
  { key: "technology", name: "Technology", kind: "normal", hint: "POS, devices, internet" },
  { key: "inventory", name: "Initial inventory", kind: "normal", hint: "Opening stock, packaging, smallwares" },
  { key: "payroll", name: "Pre-opening payroll and training", kind: "normal", hint: "Staff before opening, training" },
  { key: "marketing", name: "Marketing and launch", kind: "normal", hint: "Pre-opening promotion, soft opening" },
  { key: "contingency", name: "Contingency", kind: "contingency", hint: "Buffer for overruns — 10–15% is common" },
  { key: "working_capital", name: "Working-capital reserve", kind: "working_capital", hint: "Months of running costs after opening" },
];
