import { sql } from "drizzle-orm";
import {
  blob,
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
    /**
     * scrypt, as `scrypt$N$r$p$salt$hash`. Never a bare digest.
     *
     * NULL for passkey-only accounts, which is now the normal case — sign-up
     * creates a passkey and never asks for a password. It stays nullable
     * rather than being dropped so that an account created before passkeys
     * can still sign in with the password it already has.
     */
    passwordHash: text("password_hash"),
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

/**
 * WebAuthn credentials. One account can have several — the laptop it was
 * created on, a phone added by QR code, a hardware key.
 *
 * `id` is the credential id the authenticator chose, so it is the natural
 * primary key: a login presents it and we look the account up from it, which
 * is what makes "just tap sign in" work without first asking who you are.
 */
export const passkeys = sqliteTable(
  "passkeys",
  {
    /** Base64url credential id from the authenticator. */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publicKey: blob("public_key", { mode: "buffer" }).notNull(),
    /** Signature counter; a decrease can mean a cloned authenticator. */
    counter: integer("counter").notNull().default(0),
    /** JSON array: "internal" | "hybrid" | "usb" | "nfc" | "ble". */
    transports: text("transports", { mode: "json" }).$type<string[] | null>(),
    /** "singleDevice" | "multiDevice" — multiDevice means it syncs. */
    deviceType: text("device_type"),
    backedUp: integer("backed_up", { mode: "boolean" }).notNull().default(false),
    /** Human label: "Phone", "This device", "Security key". */
    name: text("name").notNull().default("Passkey"),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (t) => [index("passkeys_user_idx").on(t.userId)],
);

/**
 * In-flight WebAuthn ceremonies. A challenge is single-use and short-lived.
 *
 * It lives in the database rather than a cookie because the phone flow spans
 * two devices: the QR code is scanned on a phone while the ceremony belongs
 * to the browser that started it, and a cookie cannot be in both places.
 */
export const authChallenges = sqliteTable(
  "auth_challenges",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: ["register", "login", "add_passkey"] }).notNull(),
    challenge: text("challenge").notNull(),
    /** Set for add_passkey (the signed-in user); null while signing up. */
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** JSON {name, email, userId} held until the passkey verifies. */
    pending: text("pending", { mode: "json" }).$type<Record<
      string,
      string
    > | null>(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_challenges_expires_idx").on(t.expiresAt)],
);

/** One-time invitations. Sign-up is also open when ALFRED_ALLOW_SIGNUP=1. */
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
    /**
     * Set when a submission actually passed. An actionable backed by an
     * exercise is completed by doing it, not by saying so — `status` alone is
     * no longer sufficient evidence for those.
     */
    verifiedAt: integer("verified_at", { mode: "timestamp_ms" }),
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
 * Exercises — the work itself, done in the app
 * ------------------------------------------------------------------ */

export const EXERCISE_KINDS = ["code", "written"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

/** A visible example: what the task shows you before you start. */
export type ExerciseExample = { input: string; output: string; note?: string };

/**
 * One test case. `call` is a Python expression evaluated against the
 * submitted code; `expect` is compared with ==. Kept as data rather than raw
 * code so a generated test cannot be arbitrary program text.
 */
export type ExerciseTest = {
  name: string;
  call: string;
  expect: string;
  /** Hidden tests are run but not shown until after a pass. */
  hidden: boolean;
};

/** One thing a written answer has to do, for the grader to check against. */
export type RubricCriterion = { id: string; requirement: string; weight: number };

export const exercises = sqliteTable(
  "exercises",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    actionableId: text("actionable_id")
      .notNull()
      .references(() => actionables.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: EXERCISE_KINDS }).notNull(),

    /** The task, as markdown. For code, the problem statement. */
    brief: text("brief").notNull(),
    /** Currently only "python". */
    language: text("language").notNull().default("python"),
    starterCode: text("starter_code"),
    examples: text("examples", { mode: "json" })
      .$type<ExerciseExample[]>()
      .default([]),
    tests: text("tests", { mode: "json" }).$type<ExerciseTest[]>().default([]),
    /**
     * The generator's own solution. Used to verify the tests are satisfiable
     * before the exercise is offered, and revealed only after a pass.
     */
    referenceSolution: text("reference_solution"),
    /** Ordered hints, revealed one at a time on request. */
    hints: text("hints", { mode: "json" }).$type<string[]>().default([]),

    /** For written exercises. */
    rubric: text("rubric", { mode: "json" }).$type<RubricCriterion[]>().default([]),

    /**
     * Whether the reference solution passes its own tests. Null until checked.
     * A false here means the generated tests are wrong, and the exercise is
     * offered as practice without a pass/fail gate rather than blocking you on
     * a broken check.
     */
    selfCheckPassed: integer("self_check_passed", { mode: "boolean" }),
    selfCheckDetail: text("self_check_detail"),

    provider: text("provider"),
    model: text("model"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("exercises_actionable_idx").on(t.actionableId),
    index("exercises_user_idx").on(t.userId),
  ],
);

/** Every attempt, so progress is evidence rather than a checkbox. */
export const submissions = sqliteTable(
  "submissions",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    exerciseId: text("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    /** Submitted code, or the written answer. */
    body: text("body").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull().default(false),
    /** Per-test or per-criterion outcomes. */
    results: text("results", { mode: "json" }).$type<unknown>(),
    /** Grader prose for written answers. */
    feedback: text("feedback"),
    durationMs: integer("duration_ms"),
    createdAt: createdAt(),
  },
  (t) => [
    index("submissions_exercise_idx").on(t.exerciseId),
    index("submissions_user_idx").on(t.userId),
  ],
);

export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type Submission = typeof submissions.$inferSelect;

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
 * Learning handbooks
 * ------------------------------------------------------------------ */

/**
 * A generated study handbook for one application.
 *
 * Only the CONTENT is stored, never the rendered HTML. The template is code and
 * improves on its own schedule; re-rendering is microseconds while regenerating
 * costs two provider calls and a couple of minutes, so a stored page would mean
 * every template fix needed a re-generation to reach anybody.
 */
export const handbooks = sqliteTable(
  "handbooks",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** The validated plan and drills, exactly as the schemas define them. */
    content: text("content", { mode: "json" }).$type<unknown>().notNull(),
    /** How many parts it holds — enough to describe it without parsing content. */
    parts: integer("parts").notNull().default(0),
    provider: text("provider"),
    model: text("model"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("handbooks_application_idx").on(t.applicationId),
    index("handbooks_user_idx").on(t.userId),
  ],
);

/* ------------------------------------------------------------------ *
 * Job discovery
 * ------------------------------------------------------------------ */

export const JOB_SOURCE_KINDS = ["boards", "remotive", "arbeitnow"] as const;
export type JobSourceKind = (typeof JOB_SOURCE_KINDS)[number];

export const BOARD_PROVIDERS = ["greenhouse", "lever", "ashby"] as const;
export type BoardProvider = (typeof BOARD_PROVIDERS)[number];

/**
 * A standing search, re-run on a schedule.
 *
 * The criteria are stored rather than the results of applying them, so
 * tightening a search does not retroactively hide what it already found — a
 * hit you have seen stays on the list until you act on it.
 */
export const jobSearches = sqliteTable(
  "job_searches",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Words that must appear in the title. Any of them, not all. */
    titleQuery: text("title_query").notNull(),
    /** Matched loosely against the posting's location text. */
    location: text("location"),
    remoteOnly: integer("remote_only", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Annual, in whatever currency the posting states — compared loosely. */
    minSalary: integer("min_salary"),
    /** Which source kinds this search draws on. */
    sources: text("sources", { mode: "json" })
      .$type<JobSourceKind[]>()
      .notNull()
      .default(["boards"]),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    /** What the last run turned up, so a search that finds nothing is visible. */
    lastNewCount: integer("last_new_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("job_searches_user_idx").on(t.userId)],
);

/** An employer whose own ATS board is checked directly. */
export const jobBoards = sqliteTable(
  "job_boards",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: BOARD_PROVIDERS }).notNull(),
    /** The board's own identifier, e.g. `monzo` in boards-api/…/monzo/jobs. */
    slug: text("slug").notNull(),
    /** What to call the employer in the UI; the slug is rarely presentable. */
    label: text("label").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    /** Set when a board stops answering, so a dead slug explains itself. */
    lastError: text("last_error"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("job_boards_user_slug_idx").on(t.userId, t.provider, t.slug),
    index("job_boards_user_idx").on(t.userId),
  ],
);

export const JOB_HIT_STATUSES = ["new", "saved", "dismissed"] as const;
export type JobHitStatus = (typeof JOB_HIT_STATUSES)[number];

/**
 * A posting a search turned up.
 *
 * Unique on (user, source, sourceRef) so re-running a search daily cannot
 * produce the same row twice — which is the whole difficulty with a recurring
 * scan, and the reason the external id is stored rather than derived.
 */
export const jobHits = sqliteTable(
  "job_hits",
  {
    id: id(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    /** Null once the search that found it is deleted; the hit outlives it. */
    searchId: text("search_id").references(() => jobSearches.id, {
      onDelete: "set null",
    }),
    source: text("source").notNull(),
    sourceRef: text("source_ref").notNull(),
    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    remote: integer("remote", { mode: "boolean" }),
    url: text("url").notNull(),
    salaryText: text("salary_text"),
    postedAt: integer("posted_at", { mode: "timestamp_ms" }),
    snippet: text("snippet"),
    tags: text("tags", { mode: "json" }).$type<string[]>().default([]),
    status: text("status", { enum: JOB_HIT_STATUSES }).notNull().default("new"),
    /** Set when the hit is saved and becomes a tracked application. */
    applicationId: text("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    /*
     * Spelled out rather than using the createdAt() helper: that helper names
     * the column `created_at`, and a column called created_at behind a field
     * called firstSeenAt is a trap for whoever reads this next. What matters
     * about a hit is when it was first seen, not when the row was written.
     */
    firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("job_hits_ref_idx").on(t.userId, t.source, t.sourceRef),
    index("job_hits_user_status_idx").on(t.userId, t.status),
  ],
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
export type Passkey = typeof passkeys.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Invite = typeof invites.$inferSelect;
export type MailMessage = typeof mailMessages.$inferSelect;
export type NewMailMessage = typeof mailMessages.$inferInsert;
export type Handbook = typeof handbooks.$inferSelect;
export type NewHandbook = typeof handbooks.$inferInsert;
export type JobSearch = typeof jobSearches.$inferSelect;
export type NewJobSearch = typeof jobSearches.$inferInsert;
export type JobBoard = typeof jobBoards.$inferSelect;
export type JobHit = typeof jobHits.$inferSelect;
export type NewJobHit = typeof jobHits.$inferInsert;
