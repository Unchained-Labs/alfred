import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: process.env.ALFRED_DB_PATH ?? "./data/alfred.db" },
} satisfies Config;
