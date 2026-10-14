/**
 * Structured outputs reject schemas with more than 16 union-typed parameters (a `type` array
 * such as ["string", "null"], or anyOf/oneOf) — each one multiplies the grammar's compile cost.
 * Tests keep every output schema under it; prefer "" / "none" sentinels over nullable fields.
 */
export const MAX_UNION_PARAMS = 16;

export function countUnionParams(schema: unknown): number {
  if (Array.isArray(schema)) return schema.reduce((n: number, s) => n + countUnionParams(s), 0);
  if (!schema || typeof schema !== "object") return 0;
  const node = schema as Record<string, unknown>;
  const self = Array.isArray(node.type) || Array.isArray(node.anyOf) || Array.isArray(node.oneOf) ? 1 : 0;
  return self + Object.values(node).reduce((n: number, v) => n + countUnionParams(v), 0);
}
