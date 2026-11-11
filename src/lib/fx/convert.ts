/*
 * Currency conversion, the pure half.
 *
 * Salaries arrive in whatever currency the posting used, and ranking them by
 * pay means putting them on one scale first. Ranking the raw numbers would put
 * a krone salary above a euro salary worth five times as much — exactly the
 * kind of answer that looks fine until someone acts on it.
 *
 * Rates are "units per one US dollar", the shape every free feed publishes, so
 * any pair converts through USD. This module never fetches; ./store does, and
 * falls back to the table below when it cannot.
 */

export type FxRates = {
  /** Units of each currency per 1 USD. USD itself is always 1. */
  perUsd: Record<string, number>;
  /** The day the rates are for, YYYY-MM-DD. */
  date: string;
  /** Where they came from, for the page to say so. */
  source: "live" | "cached" | "fallback";
};

/**
 * Approximate rates for when no feed has ever answered. Close enough to rank
 * salaries — the gaps between real offers are tens of percent, not the one or
 * two a stale rate moves — and the page says when it is using them.
 */
export const FALLBACK_PER_USD: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
  CHF: 0.88,
  AED: 3.6725,
  SAR: 3.75,
  QAR: 3.64,
  NOK: 10.9,
  SEK: 10.6,
  DKK: 6.87,
  PLN: 3.98,
  CZK: 23.2,
  CAD: 1.38,
  AUD: 1.53,
  NZD: 1.68,
  SGD: 1.33,
  HKD: 7.79,
  JPY: 150,
  CNY: 7.2,
  INR: 84,
};

export const FALLBACK_RATES: FxRates = {
  perUsd: FALLBACK_PER_USD,
  date: "fallback",
  source: "fallback",
};

/** Currencies offered as a display currency, in a sensible order. */
export const DISPLAY_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "AED",
  "NOK",
  "SEK",
  "CHF",
] as const;

/**
 * `amount` in `from`, expressed in `to`. Null when either currency is unknown
 * to the table — an unconvertible salary is unranked, never silently treated
 * as dollars.
 */
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: FxRates,
): number | null {
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (f === t) return amount;
  const fromRate = rates.perUsd[f] ?? FALLBACK_PER_USD[f];
  const toRate = rates.perUsd[t] ?? FALLBACK_PER_USD[t];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

/**
 * The one figure a salary range is compared by: the midpoint when both ends
 * are known, otherwise whichever end there is. A posting that only states a
 * floor is ranked by the floor, which under-ranks it slightly rather than
 * inventing a ceiling.
 */
export function comparablePay(
  min: number | null,
  max: number | null,
): number | null {
  if (min != null && max != null) return (min + max) / 2;
  return min ?? max ?? null;
}

const SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£" };

/** "$125k", "€65k", "AED 300k" — compact, for tables and axes. */
export function formatMoney(value: number | null, currency: string): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const n =
    abs >= 1_000_000
      ? `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
      : abs >= 1000
        ? `${Math.round(value / 1000)}k`
        : String(Math.round(value));
  const symbol = SYMBOLS[currency];
  return symbol ? `${symbol}${n}` : `${currency} ${n}`;
}
