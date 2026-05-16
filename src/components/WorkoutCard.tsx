import type { WorkoutLog } from "@/lib/types";
import { formatLongDate, titleCase } from "@/lib/utils";

export function WorkoutCard({ workout, compact = false }: { workout: WorkoutLog; compact?: boolean }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-zinc-50">{formatLongDate(workout.workoutDate)}</div>
          <p className="mt-1 text-sm text-zinc-400">{workout.aiSummary}</p>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
          {titleCase(workout.workoutType)}
        </span>
      </div>

      {!compact && <p className="mt-3 rounded-2xl bg-black/30 p-3 text-sm text-zinc-300">{workout.rawText}</p>}

      <div className="mt-3 space-y-2">
        {workout.exercises.map((exercise) => (
          <div key={`${workout.id}-${exercise.normalizedExerciseName}`}>
            <div className="text-sm font-semibold text-amber-100">{exercise.exerciseName}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {exercise.sets.map((set) => (
                <span key={set.id} className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
                  {set.weight ? `${set.weight} x ${set.reps ?? "?"}` : set.notes ?? "bodyweight set"}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {workout.tags.map((tag) => (
          <span key={tag} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-zinc-400">
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
