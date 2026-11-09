import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { FALLBACK_PER_USD, FALLBACK_RATES, type FxRates } from "./convert";

/*
 * Today's exchange rates, fetched at most once a day per account.
 *
 * open.er-api.com is keyless and covers currencies such as AED and NOK, which
 * the ECB feed behind frankfurter.app does not — and a Gulf posting should not
 * silently drop out of the ranking. The answer is cached in the settings
 * table with its date, so
 * the Analytics page costs one request a day, and an offline box keeps using
 * yesterday's rates and then the built-in table rather than failing to render.
 */

const FX_KEY = "fx_rates";
const FEED = "https://open.er-api.com/v6/latest/USD";

type Cached = { date: string; perUsd: Record<string, number> };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readCache(userId: string): Cached | null {
  const row = db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, userId), eq(settings.key, FX_KEY)))
    .get();
  const value = row?.value as Partial<Cached> | undefined;
  if (!value?.date || !value.perUsd || typeof value.perUsd !== "object") {
    return null;
  }
  return { date: value.date, perUsd: value.perUsd };
}

function writeCache(userId: string, cached: Cached) {
  db.insert(settings)
    .values({ userId, key: FX_KEY, value: cached, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value: cached, updatedAt: new Date() },
    })
    .run();
}

async function fetchRates(): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(FEED, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      result?: string;
      rates?: Record<string, unknown>;
    };
    if (body.result !== "success" || !body.rates) return null;
    const perUsd: Record<string, number> = {};
    for (const [code, rate] of Object.entries(body.rates)) {
      if (typeof rate === "number" && rate > 0) perUsd[code] = rate;
    }
    return perUsd.USD === 1 ? perUsd : null;
  } catch {
    return null;
  }
}

export async function ratesFor(userId: string): Promise<FxRates> {
  const cached = readCache(userId);
  if (cached?.date === today()) {
    return {
      perUsd: { ...FALLBACK_PER_USD, ...cached.perUsd },
      date: cached.date,
      source: "live",
    };
  }

  const fresh = await fetchRates();
  if (fresh) {
    const entry = { date: today(), perUsd: fresh };
    writeCache(userId, entry);
    return {
      perUsd: { ...FALLBACK_PER_USD, ...fresh },
      date: entry.date,
      source: "live",
    };
  }

  if (cached) {
    return {
      perUsd: { ...FALLBACK_PER_USD, ...cached.perUsd },
      date: cached.date,
      source: "cached",
    };
  }
  return FALLBACK_RATES;
}
