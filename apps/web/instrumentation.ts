export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startUploadJanitor } = await import("./lib/janitor");
  startUploadJanitor();
}
