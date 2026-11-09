"use client";

import * as React from "react";
import type { AiJob } from "@/db/schema";

/** The application page's shared view of its AI jobs. See application-jobs.tsx. */
export type ApplicationJobs = { jobs: AiJob[]; refresh: () => void };

export const ApplicationJobsContext = React.createContext<ApplicationJobs | null>(
  null,
);

/** Null outside a provider: components that use it work without one. */
export function useApplicationJobsContext(): ApplicationJobs | null {
  return React.useContext(ApplicationJobsContext);
}
