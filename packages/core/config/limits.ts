// Limits that messages name (ARCHITECTURE §5.21). Free of imports, so the message catalog does not
// import the domain modules (they import the catalog through errors.ts) and client forms can use
// them too. The domain modules re-export them where they were defined before.

/** A team is ready to play with at least this many verified players (SPEC P0-3). */
export const READY_MEMBER_COUNT = 5;
export const MAX_TEAM_MEMBERS = 10;
/** Max. open requests per team (SPEC P0-4). */
export const MAX_OPEN_REQUESTS = 5;

export const TEAM_NAME_MIN = 2;
export const TEAM_NAME_MAX = 40;
export const TEAM_TAG_MIN = 2;
export const TEAM_TAG_MAX = 5;

export const REQUEST_NOTE_MAX = 300;
export const APPLICATION_MESSAGE_MAX = 200;
export const RATING_MIN = 1;
export const RATING_MAX = 5;

export const TEAM_LINK_MAX = 300;
/** Longer searches in the teams list are cut to this many characters (SPEC N-20). */
export const TEAM_SEARCH_MAX = 100;

export const TEAM_LIMIT_REASON_MIN = 10;
export const TEAM_LIMIT_REASON_MAX = 500;
/** The highest team limit an admin can set (SPEC N-17). */
export const MAX_TEAM_LIMIT = 50;

/** The longer side of a trimmed team logo must have at least this many pixels. */
export const MIN_LOGO_CONTENT = 128;
/** Longest side of an uploaded logo; together against decompression bombs. */
export const MAX_LOGO_SIDE = 4096;
