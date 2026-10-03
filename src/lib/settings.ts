import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_ANTHROPIC_MODEL } from "@/lib/ai/providers/anthropic";
import type { ProviderKind } from "@/lib/ai/types";

/** What Alfred knows about the user. Fuels every AI call. */
export type UserProfile = {
  name: string;
  headline: string;
  yearsExperience: number | null;
  /** Free-form résumé / background paste. The highest-signal field. */
  resume: string;
  skills: string[];
  targetRoles: string[];
  locations: string[];
  /** e.g. "160-200k USD base" */
  compensationTarget: string;
};

export type AiSettings = {
  provider: ProviderKind;
  anthropic: {
    apiKey: string;
    model: string;
    effort: "low" | "medium" | "high" | "xhigh" | "max";
  };
  openaiCompat: {
    baseUrl: string;
    apiKey: string;
    model: string;
    supportsJsonSchema: boolean;
    temperature: number;
  };
  agent: {
    endpoint: string;
    apiKey: string;
    agentName: string;
    headers: Record<string, string>;
  };
};

export type MailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  /** For Gmail/Outlook this is an app password, not the account password. */
  password: string;
  folder: string;
  /** Only look at mail newer than this many days on each sync. */
  lookbackDays: number;
  /** Run the AI triage pass on newly fetched messages. */
  autoTriage: boolean;
};

export type AlfredSettings = {
  profile: UserProfile;
  ai: AiSettings;
  mail: MailSettings;
};

export const DEFAULT_SETTINGS: AlfredSettings = {
  profile: {
    name: "",
    headline: "",
    yearsExperience: null,
    resume: "",
    skills: [],
    targetRoles: [],
    locations: [],
    compensationTarget: "",
  },
  ai: {
    provider: "anthropic",
    anthropic: { apiKey: "", model: DEFAULT_ANTHROPIC_MODEL, effort: "high" },
    openaiCompat: {
      baseUrl: "",
      apiKey: "",
      model: "",
      supportsJsonSchema: true,
      temperature: 0.3,
    },
    agent: { endpoint: "", apiKey: "", agentName: "", headers: {} },
  },
  mail: {
    enabled: false,
    host: "",
    port: 993,
    secure: true,
    user: "",
    password: "",
    folder: "INBOX",
    lookbackDays: 30,
    autoTriage: true,
  },
};

const SETTINGS_KEY = "alfred";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep-merges stored settings over defaults so new fields appear automatically. */
function merge<T>(base: T, override: unknown): T {
  if (!isRecord(override) || !isRecord(base)) {
    return (override === undefined ? base : (override as T));
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (!(key in base)) continue;
    const baseValue = (base as Record<string, unknown>)[key];
    out[key] =
      isRecord(baseValue) && isRecord(value) ? merge(baseValue, value) : value;
  }
  return out as T;
}

export function getSettings(): AlfredSettings {
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
    .get();
  return merge(DEFAULT_SETTINGS, row?.value);
}

export function saveSettings(patch: unknown): AlfredSettings {
  const next = merge(getSettings(), patch);
  db.insert(settings)
    .values({ key: SETTINGS_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: next, updatedAt: new Date() },
    })
    .run();
  return next;
}

/** True once the profile has enough substance for analysis to be useful. */
export function profileIsUsable(profile: UserProfile): boolean {
  return profile.resume.trim().length > 80 || profile.skills.length >= 3;
}

/**
 * Strips secrets before sending settings to the browser. The UI only needs to
 * know whether a credential is present, never its value.
 */
export function redactSettings(input: AlfredSettings) {
  return {
    ...input,
    ai: {
      ...input.ai,
      anthropic: {
        ...input.ai.anthropic,
        apiKey: "",
        hasApiKey: Boolean(input.ai.anthropic.apiKey || process.env.ANTHROPIC_API_KEY),
      },
      openaiCompat: {
        ...input.ai.openaiCompat,
        apiKey: "",
        hasApiKey: Boolean(input.ai.openaiCompat.apiKey),
      },
      agent: {
        ...input.ai.agent,
        apiKey: "",
        hasApiKey: Boolean(input.ai.agent.apiKey),
      },
    },
    mail: { ...input.mail, password: "", hasPassword: Boolean(input.mail.password) },
  };
}

export type RedactedSettings = ReturnType<typeof redactSettings>;
