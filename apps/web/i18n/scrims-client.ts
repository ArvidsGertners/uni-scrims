// Texts of the client components of the scrim pages (§5.21), one section per component.
import { dictionary } from "@uni-scrims/core/config/locale";

/** app/scrims/[id]/feedback-form.tsx */
export const feedbackFormMessages = dictionary(
  {
    confirm: "Antwort abschicken? Sie lässt sich danach nicht mehr ändern.",
    tookPlace: "Hat das Scrim stattgefunden?",
    rating: "Wie bewertet ihr das Team?",
    submit: "Feedback senden",
  },
  {
    confirm: "Send your answer? It can't be changed afterwards.",
    tookPlace: "Did the scrim take place?",
    rating: "How do you rate the team?",
    submit: "Send feedback",
  },
);
