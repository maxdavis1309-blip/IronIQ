import type { BodyMetrics, ParseResult, ParsedExercise, WorkoutType } from "@/lib/types";
import { normalizeExerciseName, titleCase, uid, workoutTypeLabel } from "@/lib/utils";

const EXERCISE_ALIASES: Record<string, string> = {
  bench: "Bench Press",
  "bench press": "Bench Press",
  squat: "Squat",
  deadlift: "Deadlift",
  rdl: "Romanian Deadlift",
  "romanian deadlift": "Romanian Deadlift",
  "incline db": "Incline Dumbbell Press",
  "incline dumbbell": "Incline Dumbbell Press",
  "incline machine": "Incline Bench Press Machine",
  "incline press machine": "Incline Bench Press Machine",
  "machine incline": "Incline Bench Press Machine",
  "hammer incline": "Incline Bench Press Machine",
  "hammer strength incline": "Incline Bench Press Machine",
  "shoulder press": "Shoulder Press",
  ohp: "Overhead Press",
  pullups: "Pullup",
  pullup: "Pullup",
  curls: "Dumbbell Curl",
  curl: "Dumbbell Curl",
  row: "Barbell Row",
  rows: "Barbell Row",
};

const TYPE_KEYWORDS: Array<[WorkoutType, string[]]> = [
  ["chest-back", ["chest & back", "chest and back", "chest-back", "chest/back"]],
  ["shoulders-arms", ["shoulders & arms", "shoulders and arms", "shoulder and arms", "shoulders-arms", "shoulders/arms"]],
  ["push", ["push", "bench", "chest", "incline", "tricep"]],
  ["pull", ["pull", "row", "pullup", "pulldown", "back"]],
  ["legs", ["legs", "squat", "rdl", "deadlift", "leg press", "hamstring"]],
  ["shoulders", ["shoulder", "ohp", "press"]],
  ["arms", ["arms", "curl", "tricep"]],
  ["cardio", ["cardio", "run", "bike", "stairs"]],
];

export function mockParseWorkout(rawText: string): ParseResult {
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const workoutType = inferWorkoutType(lower);
  const bodyMetrics = extractBodyMetrics(lower);
  const subjectiveNotes = extractSubjectiveNotes(text);
  const skippedExercises = extractSkippedExercises(text);
  const exercises = extractExercises(text);
  const prCandidates = exercises
    .flatMap((exercise) => exercise.sets)
    .filter((set) => (set.weight ?? 0) >= 225 || set.isPr)
    .map((set) => `${set.exerciseName} ${set.weight ?? "BW"}x${set.reps ?? "?"}`);

  const warnings = [];
  if (!exercises.length) warnings.push("No confident exercise sets found.");
  if (lower.includes("felt") || lower.includes("weird") || lower.includes("sore")) {
    warnings.push("Subjective note detected; review pain/fatigue context.");
  }

  const confidence = Math.max(
    0.48,
    Math.min(0.96, 0.58 + exercises.length * 0.11 + subjectiveNotes.length * 0.03 - warnings.length * 0.04),
  );

  return {
    workoutType,
    summary: buildSummary(workoutType, exercises, subjectiveNotes, skippedExercises),
    exercises,
    bodyMetrics,
    subjectiveNotes,
    skippedExercises,
    prCandidates,
    confidence,
    warnings,
  };
}

function inferWorkoutType(lower: string): WorkoutType {
  const match = TYPE_KEYWORDS.find(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)));
  return match?.[0] ?? "unknown";
}

function extractBodyMetrics(lower: string): BodyMetrics {
  const bodyweight = lower.match(/(?:weighed|weight|bw|bodyweight)\s*(\d{2,3}(?:\.\d+)?)/);
  return {
    bodyweight: bodyweight ? Number(bodyweight[1]) : undefined,
    sleepQuality: lower.includes("slept bad") || lower.includes("slept like trash") ? "bad" : undefined,
    energyLevel: lower.includes("strong") ? "strong" : lower.includes("weak") ? "low" : undefined,
    painNotes: extractPain(lower),
    soreness: lower.includes("sore") ? "soreness noted" : undefined,
  };
}

function extractPain(lower: string) {
  const painWords = ["shoulder", "elbow", "knee", "back", "hip", "wrist"];
  const hasPain = ["hurt", "hurts", "pain", "weird", "sore", "tweak"].some((word) => lower.includes(word));
  if (!hasPain) return undefined;
  const area = painWords.find((word) => lower.includes(word));
  return area ? `${area} issue noted` : "pain or discomfort noted";
}

function extractSubjectiveNotes(text: string) {
  return text
    .split(/[,.;\n]/)
    .map((part) => part.trim())
    .filter((part) => /slept|sleep|felt|sore|pain|hurt|weird|strong|weak|motivat|stress|missed/i.test(part));
}

function extractSkippedExercises(text: string) {
  const skipped = text.match(/skipped\s+([a-z\s]+)/i);
  if (!skipped) return [];
  return [titleCase(skipped[1].trim())];
}

function extractExercises(text: string): ParsedExercise[] {
  const chunks = text.split(/[,;\n]/).map((chunk) => chunk.trim()).filter(Boolean);
  const exercises = new Map<string, ParsedExercise>();

  for (const chunk of chunks) {
    const setMatches = Array.from(
      chunk.matchAll(/(\d+(?:\.\d+)?)\s*(?:lb|lbs|#|s)?\s*x\s*(\d+)|(\d+(?:\.\d+)?)\s+(\d+)\s*x\s*(\d+)/gi),
    );
    if (!setMatches.length) continue;

    const first = setMatches[0];
    const rawName = chunk.slice(0, first.index).replace(/[-:]+$/, "").trim();
    const exerciseName = resolveExerciseName(rawName || findExerciseAlias(chunk));
    const normalized = normalizeExerciseName(exerciseName);

    if (!exercises.has(normalized)) {
      exercises.set(normalized, {
        exerciseName,
        normalizedExerciseName: normalized,
        muscleGroup: inferMuscleGroup(normalized),
        sets: [],
      });
    }

    for (const match of setMatches) {
      const target = exercises.get(normalized);
      if (!target) continue;

      if (match[1] && match[2]) {
        target.sets.push({
          id: uid("set"),
          exerciseName,
          normalizedExerciseName: normalized,
          setNumber: target.sets.length + 1,
          weight: Number(match[1]),
          reps: Number(match[2]),
        });
      } else {
        const weight = Number(match[3]);
        const setsCount = Number(match[4]);
        const reps = Number(match[5]);
        for (let i = 0; i < setsCount; i += 1) {
          target.sets.push({
            id: uid("set"),
            exerciseName,
            normalizedExerciseName: normalized,
            setNumber: target.sets.length + 1,
            weight,
            reps,
            setsCount,
          });
        }
      }
    }
  }

  return Array.from(exercises.values());
}

function findExerciseAlias(chunk: string) {
  const lower = chunk.toLowerCase();
  return Object.keys(EXERCISE_ALIASES).find((alias) => lower.includes(alias)) ?? "Lift";
}

function resolveExerciseName(rawName: string) {
  const normalized = normalizeExerciseName(rawName);
  return EXERCISE_ALIASES[normalized] ?? titleCase(normalized || "Lift");
}

function inferMuscleGroup(normalized: string) {
  if (/bench|incline|chest/.test(normalized)) return "chest";
  if (/squat|leg/.test(normalized)) return "legs";
  if (/rdl|deadlift/.test(normalized)) return "posterior chain";
  if (/row|pullup|pulldown/.test(normalized)) return "back";
  if (/curl|tricep/.test(normalized)) return "arms";
  if (/shoulder|overhead/.test(normalized)) return "shoulders";
  return "general";
}

function buildSummary(
  workoutType: WorkoutType,
  exercises: ParsedExercise[],
  subjectiveNotes: string[],
  skippedExercises: string[],
) {
  const liftText = exercises.length
    ? exercises.map((exercise) => exercise.exerciseName).join(", ")
    : "No clear lifts parsed";
  const noteText = subjectiveNotes.length ? ` Notes: ${subjectiveNotes.join("; ")}.` : "";
  const skippedText = skippedExercises.length ? ` Skipped: ${skippedExercises.join(", ")}.` : "";
  return `${workoutTypeLabel(workoutType)} session parsed around ${liftText}.${noteText}${skippedText}`;
}
