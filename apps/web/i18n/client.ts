// Texts of client components (§5.21), one section per component. Client components import only
// this file and common.ts, so the server dictionaries stay out of the browser bundle.
import { dictionary } from "@uni-scrims/core/config/locale";

export const localeSwitcherMessages = dictionary({ language: "Sprache" }, { language: "Language" });
