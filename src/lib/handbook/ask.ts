import { z } from "zod";

/*
 * The ask panel's request, checked before anything reaches a provider.
 *
 * Kept apart from the route so it can be tested without a session or a model.
 */

export const askRequestSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, "Ask a question.")
    .max(1000, "Keep the question under 1,000 characters."),
  selection: z.string().max(4000).default(""),
  part: z.string().max(300).default(""),
  context: z.string().max(12000).default(""),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

export function parseAskRequest(
  body: unknown,
): { ok: true; value: AskRequest } | { ok: false; error: string } {
  const parsed = askRequestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "That request could not be read.",
    };
  }
  const v = parsed.data;
  return {
    ok: true,
    value: {
      question: v.question,
      selection: v.selection.trim().slice(0, 2000),
      part: v.part.trim().slice(0, 200),
      context: v.context.slice(0, 4000),
    },
  };
}

/**
 * A request this endpoint will answer: JSON, and not sent by another site.
 *
 * The session cookie is SameSite=Lax, so a cross-site POST does not carry it
 * anyway; requiring a JSON body adds the CORS preflight a plain form cannot
 * pass, and Sec-Fetch-Site rejects what a browser tells us is cross-site.
 */
export function sameSiteJson(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return false;
  const site = request.headers.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "none";
}

/**
 * A small per-user window. Every question is a model call on the user's
 * provider, and a held-down Enter key should not become forty of them.
 */
export function createRateLimit(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
