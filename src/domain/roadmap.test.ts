import { describe, expect, it } from "vitest";
import { nextUp, roadmapView, stageForStartingPoint, templateGraphErrors, type TaskNode } from "./roadmap";

function task(id: string, stage: TaskNode["stage"], dependsOn: string[] = [], status: TaskNode["status"] = "todo", sort = 0): TaskNode {
  return { id, key: id, title: id, stage, status, sort, dependsOn };
}

describe("starting point", () => {
  it.each([
    ["idea", "plan"],
    ["found_place", "plan"],
    ["building", "build"],
    ["about_to_open", "get_ready"],
    ["open", "run"],
  ] as const)("%s → %s", (sp, stage) => {
    expect(stageForStartingPoint(sp)).toBe(stage);
  });
});

describe("roadmapView", () => {
  const tasks = [
    task("concept", "plan", [], "done", 1),
    task("budget", "plan", [], "todo", 2),
    task("dti", "build", [], "done", 1),
    task("barangay", "build", ["dti"], "in_progress", 2),
    task("zoning", "build", ["barangay"], "todo", 3),
    task("fsic", "build", ["zoning"], "todo", 4),
    task("menu", "get_ready", ["budget"], "todo", 1),
  ];

  it("shows earlier unfinished work as catch-up and blocks on unfinished dependencies", () => {
    const v = roadmapView(tasks, "building");
    expect(v.focusStage).toBe("build");
    expect(v.catchUp.map((t) => t.task.id)).toEqual(["budget"]);
    const zoning = v.now.find((t) => t.task.id === "zoning")!;
    expect(zoning.state).toEqual({ kind: "blocked", by: [{ id: "barangay", title: "barangay" }] });
    expect(v.now.find((t) => t.task.id === "barangay")!.state.kind).toBe("in_progress");
    expect(v.later.map((t) => t.task.id)).toEqual(["menu"]);
  });

  it("skipped dependencies unblock", () => {
    const v = roadmapView(tasks.map((t) => (t.id === "barangay" ? { ...t, status: "skipped" as const } : t)), "building");
    expect(v.now.find((t) => t.task.id === "zoning")!.state.kind).toBe("available");
  });

  it("moves focus forward once a stage is finished", () => {
    const allBuildDone = tasks.map((t) => (t.stage === "build" ? { ...t, status: "done" as const } : t));
    expect(roadmapView(allBuildDone, "building").focusStage).toBe("get_ready");
  });

  it("nextUp puts in-progress first, then startable work in focus, then catch-up", () => {
    const v = roadmapView(tasks, "building");
    expect(nextUp(v, 3).map((t) => t.task.id)).toEqual(["barangay", "budget"]);
  });

  it("counts progress per stage", () => {
    const v = roadmapView(tasks, "idea");
    expect(v.progress.find((p) => p.stage === "build")).toEqual({ stage: "build", total: 4, finished: 1 });
  });
});

describe("templateGraphErrors", () => {
  it("accepts a valid chain", () => {
    expect(templateGraphErrors([
      { key: "a", stage: "plan", dependsOn: [] },
      { key: "b", stage: "build", dependsOn: ["a"] },
    ])).toEqual([]);
  });
  it("reports missing keys, later-stage waits, duplicates and cycles", () => {
    const errors = templateGraphErrors([
      { key: "a", stage: "plan", dependsOn: ["b"] },
      { key: "b", stage: "build", dependsOn: ["a"] },
      { key: "c", stage: "plan", dependsOn: ["ghost"] },
      { key: "c", stage: "plan", dependsOn: [] },
    ]);
    expect(errors).toContain("duplicate key c");
    expect(errors).toContain("a (plan) waits on later-stage b (build)");
    expect(errors.some((e) => e.startsWith("cycle:"))).toBe(true);
  });
});
