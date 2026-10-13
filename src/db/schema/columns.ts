import { bigint, date, timestamp, uuid } from "drizzle-orm/pg-core";

/** Client-generatable UUID primary key (offline capture creates ids on the phone). */
export const pk = () => uuid("id").primaryKey().defaultRandom();

/** Integer centavos. `mode: "number"` is safe up to ₱90 trillion. */
export const cents = (name: string) => bigint(name, { mode: "number" });

/** Calendar date as an ISO string ("2026-10-13"), Manila business days. */
export const localDate = (name: string) => date(name, { mode: "string" });

export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => tstz("created_at").defaultNow().notNull();
export const updatedAt = () =>
  tstz("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();
