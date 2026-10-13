import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "../categories";
import { allTemplates, seedErrors, templatesFor } from "./index";

describe("roadmap seed", () => {
  it("is a valid dependency graph with no cycles or later-stage waits", () => {
    expect(seedErrors()).toEqual([]);
  });

  it("only uses budget categories that exist", () => {
    const keys = new Set(DEFAULT_CATEGORIES.map((c) => c.key));
    const unknown = allTemplates().filter((t) => t.categoryKey !== null && !keys.has(t.categoryKey));
    expect(unknown.map((t) => t.key)).toEqual([]);
  });

  it("ships nothing as verified — every local rule waits for a real filing", () => {
    expect(allTemplates().filter((t) => t.verification === "verified")).toEqual([]);
  });

  it("every cost range is labelled as a placeholder", () => {
    const unlabelled = allTemplates().filter((t) => t.costMinCents !== null && !t.source?.startsWith("Placeholder"));
    expect(unlabelled.map((t) => t.key)).toEqual([]);
  });

  it("loads the Port Barton permit chain for San Vicente only", () => {
    const sv = templatesFor("PH-PLW-SANVICENTE").map((t) => t.key);
    expect(sv).toContain("svc.build.mayors_permit");
    expect(templatesFor("PH-OTHER").map((t) => t.key)).not.toContain("svc.build.mayors_permit");
  });
});
