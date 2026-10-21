// Zod schemas for user input, shared by core and the web forms.
import { Rank } from "@uni-scrims/db";
import { z } from "zod";

export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 40;
export const TEAM_TAG_MIN = 2;
export const TEAM_TAG_MAX = 5;

export const teamInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(TEAM_NAME_MIN, `Der Teamname braucht mindestens ${TEAM_NAME_MIN} Zeichen.`)
    .max(TEAM_NAME_MAX, `Der Teamname darf höchstens ${TEAM_NAME_MAX} Zeichen haben.`),
  tag: z
    .string()
    .trim()
    .min(TEAM_TAG_MIN, `Das Kürzel braucht ${TEAM_TAG_MIN} bis ${TEAM_TAG_MAX} Zeichen.`)
    .max(TEAM_TAG_MAX, `Das Kürzel braucht ${TEAM_TAG_MIN} bis ${TEAM_TAG_MAX} Zeichen.`),
  rank: z.enum(Rank, "Bitte wähle einen Rang."),
});

export type TeamInput = z.infer<typeof teamInputSchema>;
