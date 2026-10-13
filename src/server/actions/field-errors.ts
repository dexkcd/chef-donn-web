/**
 * Validation errors are keyed by the service's field names (`totalBudgetCents`); forms name
 * their inputs the way people type them (`totalBudget`). Map one onto the other so every
 * error shows up under the field it's about.
 */
export function toInputFieldErrors(errors: Record<string, string> | undefined, rename: Record<string, string> = {}): Record<string, string> | undefined {
  if (!errors) return undefined;
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    const name = rename[key] ?? (key.endsWith("Cents") && key.length > 5 ? key.slice(0, -5) : key);
    out[name] ??= message;
  }
  return out;
}
