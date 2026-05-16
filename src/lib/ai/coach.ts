import { demoWorkouts } from "@/data/seed";
import { detectPainTrends, suggestNextSet, suggestTodaysWorkout, summarizeLast30Days } from "@/lib/intelligence";
import { formatShortDate } from "@/lib/utils";

export function mockCoachResponse(userId: string, message: string) {
  const lower = message.toLowerCase();
  const citations = demoWorkouts.slice(0, 2).map((workout) => `${formatShortDate(workout.workoutDate)} ${workout.workoutType}`);

  if (lower.includes("bench")) {
    return {
      content: `${suggestNextSet(userId, "bench press")} Your shoulder note matters here, so keep warmups honest and stop if the groove feels sketchy.`,
      citations,
    };
  }

  if (lower.includes("hurt") || lower.includes("pain") || lower.includes("avoid")) {
    const pain = detectPainTrends(userId);
    return {
      content: `Recent caution flags: ${pain.map((item) => `${item.note} on ${formatShortDate(item.date)}`).join("; ")}. I would avoid aggressive incline pressing today.`,
      citations: pain.map((item) => formatShortDate(item.date)),
    };
  }

  if (lower.includes("today") || lower.includes("train")) {
    const rec = suggestTodaysWorkout(userId);
    return {
      content: `I would train ${rec.type}. Main lift: ${rec.mainLift}. Target: ${rec.target}. Caution: ${rec.caution}`,
      citations,
    };
  }

  const summary = summarizeLast30Days(userId);
  return {
    content: `Last 30 days snapshot: ${summary.summary} Biggest theme: pressing is moving, but shoulder/elbow notes should influence exercise selection.`,
    citations,
  };
}
