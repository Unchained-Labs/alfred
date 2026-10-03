import { runMigrations } from "../src/db/migrate";

runMigrations();
console.log("Alfred database is up to date.");
