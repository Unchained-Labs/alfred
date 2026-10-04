import { NextResponse } from "next/server";
import { sqlite } from "@/db";

/**
 * Liveness for the container and anything watching it.
 *
 * It asks SQLite a question rather than returning a constant. A route that
 * answers 200 whatever the state of the database is a route that reports
 * healthy while every page is failing — worse than no health check, because
 * something will be built on top of it.
 *
 * `select 1` is the cheapest query that still proves the handle is open and the
 * file readable. It deliberately does not count rows: a health check that gets
 * slower as the data grows eventually fails for reasons unrelated to health.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    sqlite.prepare("select 1").get();
    return NextResponse.json({ ok: true, db: "up" });
  } catch (error) {
    // 503, not 500: the app is running and answering, the dependency is not.
    return NextResponse.json(
      {
        ok: false,
        db: "down",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
