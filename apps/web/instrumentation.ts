export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
}
