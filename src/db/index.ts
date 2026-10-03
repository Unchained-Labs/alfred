import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const DB_PATH = process.env.ALFRED_DB_PATH ?? "./data/alfred.db";

/**
 * Next dev-mode recompiles this module on every edit. Without a global cache
 * each recompile opens another SQLite handle and we leak file descriptors.
 */
const globalForDb = globalThis as unknown as {
  __alfredSqlite?: Database.Database;
};

function openDatabase(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

export const sqlite = globalForDb.__alfredSqlite ?? openDatabase();
if (process.env.NODE_ENV !== "production") globalForDb.__alfredSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
