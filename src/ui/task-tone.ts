import type { TaskView } from "@/domain/roadmap";
import type { StatusTone } from "./status";

export function toneFor(v: TaskView): StatusTone {
  switch (v.state.kind) {
    case "done":
      return "done";
    case "skipped":
      return "skipped";
    case "in_progress":
      return "in_progress";
    case "available":
      return "available";
    case "blocked":
      return "blocked";
  }
}
