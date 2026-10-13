/**
 * Roles from the v1 spec §2.1. One matrix, checked on the server for every write (the UI
 * only hides what the server would refuse anyway).
 */
export const ROLES = ["owner", "partner", "helper", "bookkeeper"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  partner: "Partner",
  helper: "Helper",
  bookkeeper: "Bookkeeper",
};

export const ACTIONS = [
  "view.workspace",
  "members.manage",
  "profile.edit",
  "category.edit",
  "line.create",
  "line.edit",
  "line.close",
  "line.void",
  "payment.log",
  "payment.void",
  "funding.edit",
  "receipt.capture",
  "receipt.confirm_existing_line",
  "receipt.confirm_new_line",
  "receipt.reject",
  "task.set_status",
  "task.edit",
  "note.add",
  "export.csv",
] as const;
export type Action = (typeof ACTIONS)[number];

const FULL = new Set<Action>(ACTIONS);

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  owner: FULL,
  partner: FULL,
  // "Add notes, photos, receipts, update statuses; no deletions or budget changes."
  helper: new Set<Action>(["view.workspace", "receipt.capture", "receipt.confirm_existing_line", "task.set_status", "note.add"]),
  // "Read-only on budget, payments, contracts and permits; export."
  bookkeeper: new Set<Action>(["view.workspace", "export.csv"]),
};

export function can(role: Role, action: Action): boolean {
  return MATRIX[role].has(action);
}

export function denialReason(role: Role, action: Action): string {
  return `${ROLE_LABELS[role]}s can't ${ACTION_PHRASES[action]}. Ask the owner.`;
}

const ACTION_PHRASES: Record<Action, string> = {
  "view.workspace": "open this workspace",
  "members.manage": "manage members",
  "profile.edit": "change the restaurant profile",
  "category.edit": "change budget categories",
  "line.create": "add budget lines",
  "line.edit": "change budget lines",
  "line.close": "close budget lines",
  "line.void": "remove budget lines",
  "payment.log": "log payments",
  "payment.void": "void payments",
  "funding.edit": "change funding",
  "receipt.capture": "add receipts",
  "receipt.confirm_existing_line": "confirm receipts",
  "receipt.confirm_new_line": "create new budget lines from receipts",
  "receipt.reject": "reject receipts",
  "task.set_status": "update task status",
  "task.edit": "change task estimates",
  "note.add": "add notes",
  "export.csv": "export",
};
