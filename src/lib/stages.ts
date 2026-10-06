import {
  type ActionableKind,
  type ApplicationStage,
  APPLICATION_STAGES,
  type MailClass,
} from "@/db/schema";

export type StageMeta = {
  id: ApplicationStage;
  label: string;
  /** Short gloss shown on empty board columns. */
  hint: string;
  /** CSS custom-property name holding this stage's accent color. */
  token: string;
  /** Stages before a terminal outcome, in funnel order. */
  inFunnel: boolean;
};

export const STAGE_META: Record<ApplicationStage, StageMeta> = {
  wishlist: {
    id: "wishlist",
    label: "Wishlist",
    hint: "Roles you want but haven't applied to",
    token: "--stage-wishlist",
    inFunnel: true,
  },
  applied: {
    id: "applied",
    label: "Applied",
    hint: "Submitted, waiting to hear back",
    token: "--stage-applied",
    inFunnel: true,
  },
  screening: {
    id: "screening",
    label: "Screening",
    hint: "Recruiter call or take-home",
    token: "--stage-screening",
    inFunnel: true,
  },
  technical: {
    id: "technical",
    label: "Technical",
    hint: "Coding and system design rounds",
    token: "--stage-technical",
    inFunnel: true,
  },
  onsite: {
    id: "onsite",
    label: "Onsite",
    hint: "Final loop",
    token: "--stage-onsite",
    inFunnel: true,
  },
  offer: {
    id: "offer",
    label: "Offer",
    hint: "Negotiating",
    token: "--stage-offer",
    inFunnel: true,
  },
  accepted: {
    id: "accepted",
    label: "Accepted",
    hint: "Signed",
    token: "--stage-accepted",
    inFunnel: false,
  },
  rejected: {
    id: "rejected",
    label: "Rejected",
    hint: "Closed out",
    token: "--stage-rejected",
    inFunnel: false,
  },
  withdrawn: {
    id: "withdrawn",
    label: "Withdrawn",
    hint: "You pulled out",
    token: "--stage-withdrawn",
    inFunnel: false,
  },
};

/** Columns rendered on the pipeline board, left to right. */
export const BOARD_STAGES: ApplicationStage[] = [
  "wishlist",
  "applied",
  "screening",
  "technical",
  "onsite",
  "offer",
];

/** Stages shown in the conversion funnel, widest to narrowest. */
export const FUNNEL_STAGES: ApplicationStage[] = [
  "applied",
  "screening",
  "technical",
  "onsite",
  "offer",
];

export const ALL_STAGES = APPLICATION_STAGES;

export function stageLabel(stage: ApplicationStage) {
  return STAGE_META[stage]?.label ?? stage;
}

/** How far through the pipeline a stage sits, 0-1. Terminal stages return 1. */
export function stageProgress(stage: ApplicationStage): number {
  const index = BOARD_STAGES.indexOf(stage);
  if (index === -1) return 1;
  return (index + 1) / BOARD_STAGES.length;
}

export type ActionableKindMeta = {
  id: ActionableKind;
  label: string;
  /** lucide-react icon name, resolved in the component layer. */
  icon: string;
  token: string;
};

export const ACTIONABLE_META: Record<ActionableKind, ActionableKindMeta> = {
  leetcode: {
    id: "leetcode",
    label: "Coding",
    icon: "Code2",
    token: "--kind-leetcode",
  },
  concept: {
    id: "concept",
    label: "Concept",
    icon: "BookOpen",
    token: "--kind-concept",
  },
  system_design: {
    id: "system_design",
    label: "System design",
    icon: "Network",
    token: "--kind-system-design",
  },
  behavioral: {
    id: "behavioral",
    label: "Behavioral",
    icon: "MessageSquare",
    token: "--kind-behavioral",
  },
  questionnaire: {
    id: "questionnaire",
    label: "Questionnaire",
    icon: "ListChecks",
    token: "--kind-questionnaire",
  },
  research: {
    id: "research",
    label: "Research",
    icon: "Search",
    token: "--kind-research",
  },
  task: { id: "task", label: "Task", icon: "CheckSquare", token: "--kind-task" },
};

export const MAIL_CLASS_LABELS: Record<MailClass, string> = {
  application_confirmation: "Confirmation",
  interview_invite: "Interview invite",
  rejection: "Rejection",
  offer: "Offer",
  recruiter_outreach: "Recruiter",
  assessment: "Assessment",
  other: "Other",
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Low",
  2: "Normal",
  3: "High",
};

/**
 * Metadata for a kind, with a fallback.
 *
 * ACTIONABLE_META is a Record keyed by the enum, so an unexpected value reads
 * as `undefined` and the very next property access throws — which took the
 * whole Prep page and the dashboard's queue down with a 500 over one row.
 * Kinds can arrive from a model, and a row that is merely unfamiliar should
 * render plainly rather than break the page around it.
 */
export function actionableMeta(kind: string): ActionableKindMeta {
  return (
    ACTIONABLE_META[kind as ActionableKind] ?? {
      id: "concept" as ActionableKind,
      label: kind || "Task",
      icon: "CheckSquare",
      token: "--kind-concept",
    }
  );
}
