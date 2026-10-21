import type { FeedbackOutcome, ScrimFormat } from "@uni-scrims/db";

/** Display names of the formats (SPEC P0-4). */
export const SCRIM_FORMAT_LABELS: Record<ScrimFormat, string> = {
  ONE_MAP: "1 Map",
  TWO_MAPS: "2 Maps",
  BO3: "BO3",
};

/** Answers in the feedback form (SPEC Flow C). */
export const FEEDBACK_OUTCOME_LABELS: Record<FeedbackOutcome, string> = {
  PLAYED: "Hat stattgefunden",
  OPPONENT_NO_SHOW: "Gegner nicht erschienen",
  WE_COULD_NOT: "Wir konnten nicht",
};
