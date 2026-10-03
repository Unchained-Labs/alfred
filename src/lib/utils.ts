import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAY = 86_400_000;

/** "3d ago", "in 2w", "today" — compact and non-ambiguous. */
export function relativeDay(date: Date | number | null | undefined): string {
  if (date == null) return "—";
  const then = date instanceof Date ? date.getTime() : date;
  const diffDays = Math.round((then - Date.now()) / DAY);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";

  const magnitude = Math.abs(diffDays);
  const unit =
    magnitude >= 365
      ? `${Math.round(magnitude / 365)}y`
      : magnitude >= 30
        ? `${Math.round(magnitude / 30)}mo`
        : magnitude >= 7
          ? `${Math.round(magnitude / 7)}w`
          : `${magnitude}d`;

  return diffDays < 0 ? `${unit} ago` : `in ${unit}`;
}

export function formatDate(date: Date | number | null | undefined): string {
  if (date == null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date | number | null | undefined): string {
  if (date == null) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatSalary(
  min: number | null,
  max: number | null,
  currency = "USD",
): string | null {
  if (min == null && max == null) return null;
  const compact = (value: number) =>
    value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
  const symbol = { USD: "$", EUR: "€", GBP: "£" }[currency] ?? "";
  const suffix = symbol ? "" : ` ${currency}`;
  if (min != null && max != null) {
    return `${symbol}${compact(min)}–${compact(max)}${suffix}`;
  }
  return `${symbol}${compact((min ?? max)!)}${suffix}`;
}

/** Deterministic 0-359 hue from a string, for company avatar tints. */
export function hueFromString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Splits a comma/newline separated textarea into a clean list. */
export function parseList(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function pluralize(count: number, singular: string, plural?: string) {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
