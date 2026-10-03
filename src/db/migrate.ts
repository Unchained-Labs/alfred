import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";

/**
 * Applies any pending migrations from ./drizzle. Safe to call repeatedly —
 * drizzle tracks what it has already run in its own journal table.
 */
export function runMigrations() {
  migrate(db, { migrationsFolder: "./drizzle" });
}
