// Which notification types are for staff (Phase 37, ARCHITECTURE §5.35) and which for players.
import { NotifType, type StaffRole } from "@uni-scrims/db";
import { STAFF_AREAS, type StaffArea } from "./staff-areas.ts";

/** Every staff type with the admin area that shows its case (§5.9, §7). */
export const STAFF_NOTIFICATION_TYPES = [
  { type: NotifType.STAFF_VERIFICATION_PENDING, area: "queue" },
  { type: NotifType.STAFF_MESSAGE_REPORTED, area: "admin" },
  { type: NotifType.STAFF_TEAM_LIMIT_REQUEST, area: "admin" },
  { type: NotifType.STAFF_DISPUTE, area: "admin" },
] as const satisfies readonly { type: NotifType; area: StaffArea }[];

export type StaffNotifType = (typeof STAFF_NOTIFICATION_TYPES)[number]["type"];

const STAFF_AREA_OF = new Map<NotifType, StaffArea>(
  STAFF_NOTIFICATION_TYPES.map(({ type, area }) => [type, area]),
);

export function isStaffType(type: NotifType): type is StaffNotifType {
  return STAFF_AREA_OF.has(type);
}

/** The area of a staff type. */
export function staffTypeArea(type: StaffNotifType): StaffArea {
  return STAFF_AREA_OF.get(type)!;
}

/** The types the player settings show and save (§5.17). */
export const PLAYER_NOTIFICATION_TYPES = Object.values(NotifType).filter(
  (type) => !isStaffType(type),
);

/** The roles that get a staff type: those that see its area. */
export function staffTypeRoles(type: StaffNotifType): readonly StaffRole[] {
  return STAFF_AREAS[staffTypeArea(type)];
}

/** The staff types a role gets, in the order of STAFF_NOTIFICATION_TYPES. */
export function staffTypesFor(role: StaffRole | null): StaffNotifType[] {
  if (!role) return [];
  return STAFF_NOTIFICATION_TYPES.filter(({ area }) =>
    (STAFF_AREAS[area] as readonly StaffRole[]).includes(role),
  ).map(({ type }) => type);
}
