import { z } from "zod";

// Valorant map pool offered in requests. Validated with Zod; no database table.
export const MAP_POOL = [
  "Abyss",
  "Ascent",
  "Bind",
  "Breeze",
  "Corrode",
  "Fracture",
  "Haven",
  "Icebox",
  "Lotus",
  "Pearl",
  "Split",
  "Sunset",
] as const;

export type ValorantMap = (typeof MAP_POOL)[number];

// The message is a key of the catalog (src/i18n/messages.ts), which parseInput renders.
export const mapSchema = z.enum(MAP_POOL, "unknownMap");
