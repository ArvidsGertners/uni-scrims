export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // A wrong ADMIN_URL stops the start instead of failing on every request (§5.13).
  const { adminOrigin } = await import("./lib/admin-url");
  adminOrigin();
  const { startUploadJanitor } = await import("./lib/janitor");
  startUploadJanitor();
  // Visible in the logs right after a deploy; the admin page shows the same warning.
  const { missingLegalPages } = await import("./lib/legal");
  const missing = await missingLegalPages();
  if (missing.length > 0) {
    console.error(
      `Legal texts missing in LEGAL_DIR or still containing TODO: ${missing.join(", ")}`,
    );
  }
  // English versions (§5.21): without them the English pages show the German text.
  const missingEnglish = await missingLegalPages(process.env, "en");
  if (missingEnglish.length > 0) {
    console.error(
      `English legal texts missing in LEGAL_DIR or still containing TODO: ${missingEnglish.map((page) => `${page}.en.txt`).join(", ")}`,
    );
  }
}
