import path from "node:path";
import { config } from "dotenv";

// Load the monorepo .env explicitly; variables already set (e.g. in Docker) take precedence.
config({ path: path.resolve(import.meta.dirname, "../../../.env"), quiet: true });
