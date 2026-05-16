import { demoWorkouts } from "@/data/seed";
import type { ExerciseSet, WorkoutLog, WorkoutType } from "@/lib/types";
import { estimatedOneRepMax, normalizeExerciseName, titleCase } from "@/lib/utils";

export function getLastWorkoutByType(userId: string, type: WorkoutType, workouts = demoWorkouts) {
  return workouts
    .filter((workout) => workout.userId === userId && workout.workoutType === type)
    .sort((a, b) => b.workoutDate.localeCompare(a.workoutDate))[0];
}

export function getExerciseHistory(userId: string, exerciseName: string, workouts = demoWorkouts) {
  const normalized = normalizeExerciseName(exerciseName);
  return workouts
    .filter((workout) => workout.userId === userId)
    .flatMap((workout) =>
      workout.exercises
        .filter((exercise) => exercise.normalizedExerciseName === normalized)
        .flatMap((exercise) => exercise.sets.map((set) => ({ workout, exercise, set }))),
    )
    .sort((a, b) => b.workout.workoutDate.localeCompare(a.workout.workoutDate));
}

export function getVolumeByMuscleGroup(userId: string, workouts = demoWorkouts) {
  const groups: Record<string, number> = {};
  workouts
    .filter((workout) => workout.userId === userId)
    .forEach((workout) => {
      workout.exercises.forEach((exercise) => {
        const volume = exercise.sets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0);
        groups[exercise.muscleGroup ?? "general"] = (groups[exercise.muscleGroup ?? "general"] ?? 0) + volume;
      });
    });
  return groups;
}

export function detectPRs(userId: string, exerciseSet: ExerciseSet, workouts = demoWorkouts) {
  const history = getExerciseHistory(userId, exerciseSet.exerciseName, workouts);
  const current = estimatedOneRepMax(exerciseSet.weight, exerciseSet.reps);
  const previousBest = Math.max(...history.map(({ set }) => estimatedOneRepMax(set.weight, set.reps)), 0);
  return current > previousBest;
}

export function detectPainTrends(userId: string, workouts = demoWorkouts) {
  return workouts
    .filter((workout) => workout.userId === userId && (workout.painNotes || workout.tags.includes("pain")))
    .map((workout) => ({
      date: workout.workoutDate,
      note: workout.painNotes ?? "pain tag logged",
      lifts: workout.exercises.map((exercise) => exercise.exerciseName),
    }));
}

export function suggestNextSet(userId: string, exerciseName: string, workouts = demoWorkouts) {
  const history = getExerciseHistory(userId, exerciseName, workouts);
  const last = history[0]?.set;
  if (!last?.weight || !last?.reps) return `Log ${titleCase(exerciseName)} once more so IronIQ can set a target.`;
  if (last.reps < 6) return `Last time: ${last.weight} x ${last.reps}. Suggested: ${last.weight} x ${last.reps + 1} or ${last.weight + 5} x ${Math.max(1, last.reps - 1)}.`;
  return `Last time: ${last.weight} x ${last.reps}. Suggested: ${last.weight} x ${last.reps + 1} before adding weight.`;
}

export function suggestTodaysWorkout(userId: string, workouts = demoWorkouts) {
  const recent = workouts.filter((workout) => workout.userId === userId).slice(0, 3);
  const recentTypes = recent.map((workout) => workout.workoutType);
  const hasPain = recent.some((workout) => workout.tags.includes("pain"));
  const type = recentTypes.includes("legs") ? "push" : "legs";

  return {
    type,
    mainLift: type === "legs" ? "Squat" : "Bench Press",
    accessories: type === "legs" ? ["Romanian Deadlift", "Leg Press", "Hamstring Curl"] : ["Chest-Supported Row", "Cable Fly", "Tricep Pushdown"],
    target: type === "legs" ? "3-4 sets of 5 at a smooth RPE 7-8" : "205 x 6 or 210 x 4 if warmups move well",
    caution: hasPain ? "Keep pressing pain-free and avoid chasing a PR if shoulder/elbow notes show up." : "No major caution flags in recent demo data.",
    why: "Based on recent split balance, last logged muscle groups, and pain notes.",
  };
}

export function summarizeLast30Days(userId: string, workouts = demoWorkouts) {
  const userWorkouts = workouts.filter((workout) => workout.userId === userId);
  const sets = userWorkouts.flatMap((workout) => workout.exercises.flatMap((exercise) => exercise.sets));
  const volume = sets.reduce((sum, set) => sum + (set.weight ?? 0) * (set.reps ?? 0), 0);
  const pain = detectPainTrends(userId, workouts);
  return {
    workouts: userWorkouts.length,
    sets: sets.length,
    volume,
    painNotes: pain.length,
    summary: `${userWorkouts.length} workouts, ${sets.length} sets, ${volume.toLocaleString()} lb logged volume, ${pain.length} pain flags.`,
  };
}

export function getTopSets(workouts: WorkoutLog[]) {
  return workouts
    .flatMap((workout) =>
      workout.exercises.flatMap((exercise) =>
        exercise.sets.map((set) => ({
          workout,
          exercise: exercise.exerciseName,
          set,
          e1rm: estimatedOneRepMax(set.weight, set.reps),
        })),
      ),
    )
    .sort((a, b) => b.e1rm - a.e1rm);
}
