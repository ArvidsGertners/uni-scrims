import { type FeedbackOutcome, MemberRole, type ScrimFormat, type StaffRole } from "@uni-scrims/db";

/** Display names of the formats (SPEC P0-4). */
export const SCRIM_FORMAT_LABELS: Record<ScrimFormat, string> = {
  ONE_MAP: "1 Map",
  TWO_MAPS: "2 Maps",
  BO3: "BO3",
};

/** Roles of team members in the order the team page offers them (SPEC N-1). */
export const MEMBER_ROLES: readonly MemberRole[] = [
  MemberRole.PLAYER,
  MemberRole.SUBSTITUTE,
  MemberRole.COACH,
];

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  PLAYER: "Spieler",
  SUBSTITUTE: "Ersatzspieler",
  COACH: "Coach",
};

/** Staff roles (SPEC N-4). */
export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  OPERATOR: "Betreiber",
  ADMIN: "Admin",
  REVIEWER: "Prüfer",
};

/** Answers in the feedback form (SPEC Flow C). */
export const FEEDBACK_OUTCOME_LABELS: Record<FeedbackOutcome, string> = {
  PLAYED: "Hat stattgefunden",
  OPPONENT_NO_SHOW: "Gegner nicht erschienen",
  WE_COULD_NOT: "Wir konnten nicht",
};
