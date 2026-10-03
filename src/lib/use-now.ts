"use client";

import * as React from "react";

/**
 * The current time, stable within a render.
 *
 * `Date.now()` called during render is impure, and because the server and the
 * browser evaluate it at different moments it can produce different markup on
 * each side — a real hazard for anything that crosses a threshold, like an
 * "overdue" badge. This returns null until after mount, so time-dependent
 * styling simply does not render on the server.
 *
 * The value also refreshes on an interval, so a page left open does not keep
 * showing a deadline as upcoming once it has passed.
 */
export function useNow(intervalMs = 60_000): number | null {
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    // Scheduled rather than assigned synchronously in the effect body: that
    // keeps the first value out of a cascading render.
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [intervalMs]);

  return now;
}

/** True only once mounted and the deadline has genuinely passed. */
export function isOverdue(
  deadline: Date | null | undefined,
  now: number | null,
): boolean {
  return now != null && deadline != null && deadline.getTime() < now;
}
