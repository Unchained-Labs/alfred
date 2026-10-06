import { NextResponse } from "next/server";
import { AiError, AiNotConfiguredError } from "@/lib/ai/types";
import { ConfigError, InputError, NotEarnedError } from "@/lib/errors";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json(data, { status: init ?? 200 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Turns an unexpected throw into a response the UI can display. AI provider
 * failures are the common case and carry a message worth surfacing verbatim —
 * "Anthropic rejected the API key" is far more useful than "500".
 */
export function failed(error: unknown) {
  if (error instanceof AiNotConfiguredError) {
    return NextResponse.json(
      { error: error.message, code: "ai_not_configured" },
      { status: 409 },
    );
  }
  if (error instanceof UnauthorizedError) {
    return NextResponse.json(
      { error: error.message, code: "unauthorized" },
      { status: 401 },
    );
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json(
      { error: error.message, code: "forbidden" },
      { status: 403 },
    );
  }
  if (error instanceof NotEarnedError) {
    return NextResponse.json(
      { error: error.message, code: "not_earned" },
      { status: 409 },
    );
  }
  if (error instanceof InputError) {
    return NextResponse.json(
      { error: error.message, code: "invalid_input" },
      { status: 400 },
    );
  }
  if (error instanceof ConfigError) {
    return NextResponse.json(
      { error: error.message, code: "not_configured" },
      { status: 400 },
    );
  }
  if (error instanceof AiError) {
    return NextResponse.json(
      { error: error.message, retryable: error.retryable },
      { status: error.retryable ? 503 : 502 },
    );
  }

  console.error("[alfred] unhandled route error:", error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 },
  );
}

/** Reads a JSON body, returning `{}` rather than throwing on an empty one. */
export async function readJson<T = Record<string, unknown>>(
  request: Request,
): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

/** Coerces an incoming ISO string / epoch / null into a Date or null. */
export function asDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
