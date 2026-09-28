// Runs once when the server starts (Next.js instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startDailyReviewScheduler } = await import("./lib/review/scheduler");
  startDailyReviewScheduler();
}
