/**
 * The roadmap: every step from idea to opening, in dependency order. The owner says where
 * they are; we show what's relevant now, what they skipped past, and what comes later.
 */
export const STAGES = ["plan", "build", "get_ready", "run", "improve"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  plan: "Plan",
  build: "Build",
  get_ready: "Get ready",
  run: "Run",
  improve: "Improve",
};

export const STARTING_POINTS = ["idea", "found_place", "building", "about_to_open", "open"] as const;
export type StartingPoint = (typeof STARTING_POINTS)[number];

export const STARTING_POINT_LABELS: Record<StartingPoint, string> = {
  idea: "Just an idea",
  found_place: "Found a place",
  building: "Building",
  about_to_open: "About to open",
  open: "Already open",
};

const STARTING_STAGE: Record<StartingPoint, Stage> = {
  idea: "plan",
  found_place: "plan",
  building: "build",
  about_to_open: "get_ready",
  open: "run",
};

export function stageForStartingPoint(sp: StartingPoint): Stage {
  return STARTING_STAGE[sp];
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";

export interface TaskNode {
  id: string;
  key: string;
  title: string;
  stage: Stage;
  status: TaskStatus;
  sort: number;
  /** Task ids this task waits on. */
  dependsOn: readonly string[];
}

export type TaskState =
  | { kind: "done" }
  | { kind: "skipped" }
  | { kind: "in_progress" }
  | { kind: "available" }
  | { kind: "blocked"; by: { id: string; title: string }[] };

export interface TaskView {
  task: TaskNode;
  state: TaskState;
}

export interface StageProgress {
  stage: Stage;
  total: number;
  finished: number;
}

export interface RoadmapView {
  startStage: Stage;
  focusStage: Stage;
  /** Earlier-stage tasks not yet ticked off: "Catch up — mark what's done". */
  catchUp: TaskView[];
  now: TaskView[];
  later: TaskView[];
  progress: StageProgress[];
}

const finished = (s: TaskStatus) => s === "done" || s === "skipped";

export function taskState(task: TaskNode, byId: ReadonlyMap<string, TaskNode>): TaskState {
  if (task.status === "done") return { kind: "done" };
  if (task.status === "skipped") return { kind: "skipped" };
  const blockers = task.dependsOn
    .map((id) => byId.get(id))
    .filter((d): d is TaskNode => d !== undefined && !finished(d.status))
    .map((d) => ({ id: d.id, title: d.title }));
  if (blockers.length > 0) return { kind: "blocked", by: blockers };
  return task.status === "in_progress" ? { kind: "in_progress" } : { kind: "available" };
}

export function roadmapView(tasks: readonly TaskNode[], startingPoint: StartingPoint): RoadmapView {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = [...tasks].sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage) || a.sort - b.sort);
  const views = ordered.map((task) => ({ task, state: taskState(task, byId) }));

  const startStage = stageForStartingPoint(startingPoint);
  const startIdx = stageIndex(startStage);
  // Focus moves forward once every task in a stage is finished.
  let focusIdx = startIdx;
  while (
    focusIdx < STAGES.length - 1 &&
    views.filter((v) => stageIndex(v.task.stage) === focusIdx).every((v) => finished(v.task.status))
  ) {
    focusIdx++;
  }
  const focusStage = STAGES[focusIdx] ?? startStage;

  const progress = STAGES.map((stage) => {
    const inStage = tasks.filter((t) => t.stage === stage);
    return { stage, total: inStage.length, finished: inStage.filter((t) => finished(t.status)).length };
  });

  return {
    startStage,
    focusStage,
    catchUp: views.filter((v) => stageIndex(v.task.stage) < focusIdx && !finished(v.task.status)),
    now: views.filter((v) => stageIndex(v.task.stage) === focusIdx),
    later: views.filter((v) => stageIndex(v.task.stage) > focusIdx),
    progress,
  };
}

/** The few things to do next: in-progress first, then what's startable now, then catch-up. */
export function nextUp(view: RoadmapView, n = 3): TaskView[] {
  const active = (vs: TaskView[]) => vs.filter((v) => v.state.kind === "in_progress");
  const available = (vs: TaskView[]) => vs.filter((v) => v.state.kind === "available");
  const picks = [
    ...active(view.catchUp),
    ...active(view.now),
    ...available(view.now),
    ...available(view.catchUp),
  ];
  return picks.slice(0, n);
}

export interface TemplateNode {
  key: string;
  stage: Stage;
  dependsOn: readonly string[];
}

/** Seed sanity: missing keys, duplicate keys, cycles, and steps that wait on a later stage. */
export function templateGraphErrors(templates: readonly TemplateNode[]): string[] {
  const errors: string[] = [];
  const byKey = new Map<string, TemplateNode>();
  for (const t of templates) {
    if (byKey.has(t.key)) errors.push(`duplicate key ${t.key}`);
    byKey.set(t.key, t);
  }
  for (const t of templates) {
    for (const dep of t.dependsOn) {
      const d = byKey.get(dep);
      if (!d) errors.push(`${t.key} depends on missing ${dep}`);
      else if (stageIndex(d.stage) > stageIndex(t.stage)) errors.push(`${t.key} (${t.stage}) waits on later-stage ${dep} (${d.stage})`);
    }
  }
  const state = new Map<string, "visiting" | "done">();
  const visit = (key: string, path: string[]) => {
    const s = state.get(key);
    if (s === "done") return;
    if (s === "visiting") {
      errors.push(`cycle: ${[...path, key].join(" → ")}`);
      return;
    }
    state.set(key, "visiting");
    for (const dep of byKey.get(key)?.dependsOn ?? []) if (byKey.has(dep)) visit(dep, [...path, key]);
    state.set(key, "done");
  };
  for (const t of templates) visit(t.key, []);
  return errors;
}
