// The what's new dialog (SPEC N-29, ARCHITECTURE §5.31). Free of imports, so the browser can use it.
// A new edition: change the slides and this key; everyone sees the dialog once more.

/** The current edition; User.whatsNewSeen holds the last one a user closed. */
export const WHATS_NEW_EDITION = "2026-10-phases-36-40";

/** The slides of the current edition, in this order; texts and art live in the web app. */
export const WHATS_NEW_SLIDES = ["bell", "opl", "uniligaLeague", "landingShowcase"] as const;

export type WhatsNewSlide = (typeof WHATS_NEW_SLIDES)[number];
