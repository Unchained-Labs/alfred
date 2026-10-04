import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/* ------------------------------------------------------------------ *
 * Shared column helpers
 * ------------------------------------------------------------------ */

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

/* ------------------------------------------------------------------ *
 * Accounts
 * ------------------------------------------------------------------ */

export const USER_ROLES = ["owner", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = sqliteTable(
  "users",
  {
    id: id(),
    /** Stored lowercased and trimmed; the unique index is on that form. */
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    /** scrypt, as `scrypt$N$r$p$salt$hash`. Never a bare digest. */
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull().default("member"),
    /** Set when the account is suspended; sessions are revoked with it. */
    disabledAt: integer("disabled_at", { mode: "timestamp_ms" }),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/**
 * Server-side sessions. The cookie carries an opaque token; only its SHA-256
 * is stored, so a leaked database cannot be replayed as a login.
 */
export const sessions = sqliteTable(
  "sessions",
  {
    /** SHA-256 of the token, hex. */
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    /** Truncated; enough to recognise a device, not to fingerprint one. */
    userAgent: text("user_agent"),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time invitations. There is no public sign-up. */
export const invites = sqliteTable(
  "invites",
  {
    id: id(),
    /** SHA-256 of the invite token, hex. The plaintext is shown once. */
    tokenHash: text("token_hash").notNull(),
    email: text("email").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull().default("member"),
    invitedBy: text("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invites_token_idx").on(t.tokenHash),
    index("invites_email_idx").on(t.email),
  ],
);

/* ------------------------------------------------------------------ *
 * Applications — the spine of the app
 * ------------------------------------------------------------------ */

/** Ordered pipeline stages. Order matters: it drives the funnel + board. */
export const APPLICATION_STAGES = [
  "wishlist",
  "applied",
  "screening",
  "technical",
  "onsite",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

/** Stages that mean the application is no longer progressing. */
export const TERMINAL_STAGES: ApplicationStage[] = [
  "accepted",
  "rejected",
  "withdrawn",
];

export const applications = sqliteTable(
  "applications",
  {
    id: id(),
    /**
     * Owner. Nullable only so that a database created before accounts existed
     * can be migrated — `claimOrphanedData` assigns those rows to the first
     * account. Every query filters on it; a null owner is never visible.
     */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    /** onsite | hybrid | remote */
    workMode: text("work_mode"),
    /** intern | junior | mid | senior | staff | principal | lead */
    seniority: text("seniority"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    currency: text("currency").default("USD"),
    jobUrl: text("job_url"),
    /** manual | email | import */
    source: text("source").notNull().default("manual"),
    stage: text("stage", { enum: APPLICATION_STAGES })
      .notNull()
      .default("wishlist"),
    /** 1 = low, 2 = normal, 3 = high */
    priority: integer("priority").notNull().default(2),
    /** Hand-ordered position within a board column. */
    boardOrder: real("board_order").notNull().default(0),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
    appliedAt: integer("applied_at", { mode: "timestamp_ms" }),
    nextActionAt: integer("next_action_at", { mode: "timestamp_ms" }),
    nextActionLabel: text("next_action_label"),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("applications_stage_idx").on(t.stage),
    index("applications_company_idx").on(t.company),
    index("applications_next_action_idx").on(t.nextActionAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Timeline events
 * ------------------------------------------------------------------ */

export const EVENT_TYPES = [
  "created",
  "stage_change",
  "note",
  "email",
  "interview",
  "task",
  "ai",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const events = sqliteTable(
  "events",
  {
    id: id(),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    /**
     * Owner. Nullable only so that a database created before accounts existed
     * can be migrated — `claimOrphanedData` assigns those rows to the first
     * account. Every query filters on it; a null owner is never visible.
     */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: EVENT_TYPES }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdAt: createdAt(),
  },
  (t) => [
    index("events_application_idx").on(t.applicationId),
    index("events_occurred_idx").on(t.occurredAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Actionables — the "what do I do about it" layer
 * ------------------------------------------------------------------ */

export const ACTIONABLE_KINDS = [
  "leetcode",
  "concept",
  "system_design",
  "behavioral",
  "questionnaire",
  "research",
  "task",
] as const;
export type ActionableKind = (typeof ACTIONABLE_KINDS)[number];

export const ACTIONABLE_STATUSES = [
  "todo",
  "in_progress",
  "done",
  "skipped",
] as const;
export type ActionableStatus = (typeof ACTIONABLE_STATUSES)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const actionables = sqliteTable(
  "actionables",
  {
    id: id(),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    /**
     * Owner. Nullable only so that a database created before accounts existed
     * can be migrated — `claimOrphanedData` assigns those rows to the first
     * account. Every query filters on it; a null owner is never visible.
     */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ACTIONABLE_KINDS }).notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    /** Why this matters for *this* job — the AI's justification. */
    rationale: text("rationale"),
    difficulty: text("difficulty", { enum: DIFFICULTIES }),
    /** DS&A pattern, e.g. "sliding window", "topological sort". */
    pattern: text("pattern"),
    estMinutes: integer("est_minutes"),
    url: text("url"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
    status: text("status", { enum: ACTIONABLE_STATUSES }).notNull().default("todo"),
    /** 1 = low, 2 = normal, 3 = high */
    priority: integer("priority").notNull().default(2),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    aiGenerated: integer("ai_generated", { mode: "boolean" })
      .notNull()
      .default(false),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("actionables_application_idx").on(t.applicationId),
    index("actionables_status_idx").on(t.status),
    index("actionables_kind_idx").on(t.kind),
  ],
);

/* ------------------------------------------------------------------ *
 * Interview questionnaires
 * ------------------------------------------------------------------ */

export const questions = sqliteTable(
  "questions",
  {
    id: id(),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    actionableId: text("actionable_id").references(() => actionables.id, {
      onDelete: "set null",
    }),
    /**
     * Owner. Nullable only so that a database created before accounts existed
     * can be migrated — `claimOrphanedData` assigns those rows to the first
     * account. Every query filters on it; a null owner is never visible.
     */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    /** technical | behavioral | system_design | culture | compensation */
    category: text("category").notNull().default("technical"),
    /** What the interviewer is actually probing for. */
    probing: text("probing"),
    suggestedAnswer: text("suggested_answer"),
    userAnswer: text("user_answer"),
    /** Self-rated readiness, 1-5. Null until the user rates it. */
    confidence: integer("confidence"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("questions_application_idx").on(t.applicationId)],
);

/* ------------------------------------------------------------------ *
 * AI job analysis snapshots
 * ------------------------------------------------------------------ */

export type SkillMatch = {
  skill: string;
  /** have | partial | gap */
  level: "have" | "partial" | "gap";
  note?: string;
};

export const analyses = sqliteTable(
  "analyses",
  {
    id: id(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    /** 0-100 */
    fitScore: integer("fit_score").notNull(),
    verdict: text("verdict").notNull(),
    summary: text("summary").notNull(),
    skills: text("skills", { mode: "json" }).$type<SkillMatch[]>().default([]),
    strengths: text("strengths", { mode: "json" }).$type<string[]>().default([]),
    gaps: text("gaps", { mode: "json" }).$type<string[]>().default([]),
    interviewFocus: text("interview_focus", { mode: "json" })
      .$type<string[]>()
      .default([]),
    salaryInsight: text("salary_insight"),
    /** Tailored resume / cover-letter angle. */
    positioning: text("positioning"),
    provider: text("provider").notNull(),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [index("analyses_application_idx").on(t.applicationId)],
);

/* ------------------------------------------------------------------ *
 * Mailbox ingestion
 * ------------------------------------------------------------------ */

export const MAIL_CLASSES = [
  "application_confirmation",
  "interview_invite",
  "rejection",
  "offer",
  "recruiter_outreach",
  "assessment",
  "other",
] as const;
export type MailClass = (typeof MAIL_CLASSES)[number];

export const MAIL_STATUSES = ["pending", "linked", "ignored"] as const;
export type MailStatus = (typeof MAIL_STATUSES)[number];

export const mailMessages = sqliteTable(
  "mail_messages",
  {
    id: id(),
    /** RFC822 Message-ID — the dedupe key across syncs. */
    /**
     * Owner. Nullable only so that a database created before accounts existed
     * can be migrated — `claimOrphanedData` assigns those rows to the first
     * account. Every query filters on it; a null owner is never visible.
     */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    folder: text("folder").notNull().default("INBOX"),
    fromAddress: text("from_address"),
    fromName: text("from_name"),
    subject: text("subject"),
    snippet: text("snippet"),
    body: text("body"),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    classification: text("classification", { enum: MAIL_CLASSES }),
    /** 0-1 model confidence in the classification. */
    confidence: real("confidence"),
    /** Company/title the classifier pulled out, before linking. */
    detectedCompany: text("detected_company"),
    detectedTitle: text("detected_title"),
    suggestedStage: text("suggested_stage", { enum: APPLICATION_STAGES }),
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    status: text("status", { enum: MAIL_STATUSES }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (t) => [
    // Per account: the same Message-ID can legitimately land in two mailboxes.
    uniqueIndex("mail_message_id_idx").on(t.userId, t.messageId),
    index("mail_status_idx").on(t.status),
    index("mail_received_idx").on(t.receivedAt),
  ],
);

/* ------------------------------------------------------------------ *
 * Settings — single-row key/value store
 * ------------------------------------------------------------------ */

export const settings = sqliteTable(
  "settings",
  {
    id: id(),
    /** Null only for rows predating accounts; claimed on first setup. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).$type<unknown>(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("settings_user_key_idx").on(t.userId, t.key)],
);

/* ------------------------------------------------------------------ *
 * Inferred types
 * ------------------------------------------------------------------ */

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Actionable = typeof actionables.$inferSelect;
export type NewActionable = typeof actionables.$inferInsert;
export type Question = typeof questions.$inferSelect;
export type NewQuestion = typeof questions.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type MailMessage = typeof mailMessages.$inferSelect;
export type NewMailMessage = typeof mailMessages.$inferInsert;
