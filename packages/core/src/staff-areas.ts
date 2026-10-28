// Which roles see which part of the admin area (ARCHITECTURE §5.9, §7). Its own module without
// imports from core: notification-types.ts needs it while schemas.ts loads (Phase 37, §5.35).
import { StaffRole } from "@uni-scrims/db";

/** Which roles see which part of the admin area (§5.9). */
export const STAFF_AREAS = {
  /** Verification queue and file access. */
  queue: [StaffRole.OPERATOR, StaffRole.ADMIN, StaffRole.REVIEWER],
  /** Disputes, bans, failed notifications, bot status, statistics. */
  admin: [StaffRole.OPERATOR, StaffRole.ADMIN],
  /** Roles and 2FA resets. */
  staff: [StaffRole.OPERATOR],
} as const satisfies Record<string, readonly StaffRole[]>;

export type StaffArea = keyof typeof STAFF_AREAS;

/** Whether a role sees an area of the admin area; for the navigation. */
export function staffArea(role: StaffRole | null, area: StaffArea): boolean {
  return role !== null && (STAFF_AREAS[area] as readonly StaffRole[]).includes(role);
}
