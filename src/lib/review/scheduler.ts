/**
 * Sends the daily sheet once a day, after DAILY_REVIEW_HOUR_IST (default 8)
 * India time, for the day before. Started once per server process from
 * src/instrumentation.ts; does nothing unless DAILY_REVIEW_RECIPIENTS is set,
 * so test deployments (Railway, local) never e-mail anyone.
 *
 * The day already sent is kept in the database (app_config), so a restart or
 * a redeploy does not send the same sheet twice, and a server that was down
 * at eight sends when it comes back.
 */
import { prisma } from "@/lib/db";
import { reviewRecipients, sendDailyReview } from "./dailyReview";
import { istDate, istHour, previousDay } from "./pairs";

const SENT_KEY = "daily_review_sent_for";
const CHECK_EVERY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS_PER_DAY = 3;

let started = false;
let failedAttempts = {day: "", count: 0};

/** Marks `today` as sent, unless it already was. Returns whether this caller won. */
async function claim(today: string): Promise<{won: boolean; previous: string | null}> {
  const current = await prisma.appConfig.findUnique({where: {key: SENT_KEY}});
  if (current?.value === today) return {won: false, previous: current.value};
  if (!current) {
    try {
      await prisma.appConfig.create({data: {key: SENT_KEY, value: today, label: "Daily review sheet: last India-time day it was sent"}});
      return {won: true, previous: null};
    } catch {
      return {won: false, previous: null}; // another process created it first
    }
  }
  const changed = await prisma.appConfig.updateMany({where: {key: SENT_KEY, value: current.value}, data: {value: today}});
  return {won: changed.count === 1, previous: current.value};
}

export async function dailyReviewTick(now = new Date()): Promise<string> {
  if (!reviewRecipients().length) return "off: no recipients";
  const sendHour = Number(process.env.DAILY_REVIEW_HOUR_IST || 8);
  if (istHour(now) < sendHour) return "waiting";
  const today = istDate(now);
  if (failedAttempts.day === today && failedAttempts.count >= MAX_ATTEMPTS_PER_DAY) return "gave up today";

  const {won, previous} = await claim(today);
  if (!won) return "already sent";
  try {
    const result = await sendDailyReview(previousDay(today));
    console.log(`[daily-review] sent ${result.questions} question(s) for ${previousDay(today)} to ${result.recipients.join(", ")}`);
    return "sent";
  } catch (error) {
    // Release the claim so the next check retries, a few times at most.
    await prisma.appConfig.update({where: {key: SENT_KEY}, data: {value: previous ?? ""}}).catch(() => undefined);
    failedAttempts = {day: today, count: failedAttempts.day === today ? failedAttempts.count + 1 : 1};
    console.error(`[daily-review] sending failed (attempt ${failedAttempts.count}):`, error);
    return "failed";
  }
}

export function startDailyReviewScheduler(): void {
  if (started) return;
  started = true;
  if (!reviewRecipients().length) {
    console.log("[daily-review] off: DAILY_REVIEW_RECIPIENTS is not set");
    return;
  }
  const tick = () => { dailyReviewTick().catch((error) => console.error("[daily-review] check failed:", error)); };
  setTimeout(tick, 60 * 1000); // let the server finish starting first
  setInterval(tick, CHECK_EVERY_MS).unref?.();
}
