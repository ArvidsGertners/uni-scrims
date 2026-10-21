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

export const mapSchema = z.enum(MAP_POOL);
