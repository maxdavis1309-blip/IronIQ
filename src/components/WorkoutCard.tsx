"use client";

import { ChevronDown, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { WorkoutLog } from "@/lib/types";
import { formatLongDate, titleCase } from "@/lib/utils";

export function WorkoutCard({
  workout,
  compact = false,
  onEdit,
  onDelete,
}: {
  workout: WorkoutLog;
  compact?: boolean;
  onEdit?: (workoutId: string) => void;
  onDelete?: (workoutId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(compact);
  const showDetails = compact || isExpanded;
  const exercisePreview = workout.exercises.map((exercise) => exercise.exerciseName).join(", ");

  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={() => !compact && setIsExpanded((value) => !value)} className="min-w-0 flex-1 text-left" aria-expanded={showDetails}>
          <div className="flex items-center gap-2">
            {!compact && <ChevronDown className={`h-4 w-4 shrink-0 text-amber-100 transition ${isExpanded ? "rotate-180" : ""}`} />}
            <div className="truncate text-base font-semibold text-zinc-50">{formatLongDate(workout.workoutDate)}</div>
          </div>
          {!compact && <p className="mt-1 line-clamp-2 text-sm font-semibold text-amber-100">{exercisePreview}</p>}
          {compact && <p className="mt-1 text-sm text-zinc-400">{workout.aiSummary}</p>}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            {titleCase(workout.workoutType)}
          </span>
          {!compact && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(workout.id)}
              className="grid min-h-9 min-w-9 place-items-center rounded-full border border-amber-200/20 bg-amber-200/10 text-amber-100"
              aria-label="Edit workout"
              title="Edit workout"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {!compact && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(workout.id)}
              className="grid min-h-9 min-w-9 place-items-center rounded-full border border-red-300/20 bg-red-300/10 text-red-100"
              aria-label="Delete workout"
              title="Delete workout"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {showDetails && (
        <>
          <div className={`mt-3 ${compact ? "space-y-2" : "space-y-3"}`}>
            {workout.exercises.map((exercise) => (
              <div key={`${workout.id}-${exercise.normalizedExerciseName}`} className={compact ? "" : "rounded-2xl bg-black/20 p-3"}>
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
        </>
      )}
    </article>
  );
}
