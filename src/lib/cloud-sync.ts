import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudSyncState, RecoveryEntry, WorkoutLog } from "@/lib/types";

type AppSyncRow = {
  workouts: unknown;
  active_workout: unknown;
  recovery_entries: unknown;
  updated_at: string | null;
};

export type CloudSyncLoadResult = {
  state: CloudSyncState | null;
  updatedAt: string | null;
};

export async function loadCloudSyncState(supabase: SupabaseClient, userId: string): Promise<CloudSyncLoadResult> {
  const { data, error } = await supabase
    .from("app_sync_states")
    .select("workouts, active_workout, recovery_entries, updated_at")
    .eq("user_id", userId)
    .maybeSingle<AppSyncRow>();

  if (error) throw error;
  if (!data) return { state: null, updatedAt: null };

  return {
    state: {
      workouts: Array.isArray(data.workouts) ? (data.workouts as WorkoutLog[]) : [],
      activeWorkout: (data.active_workout as WorkoutLog | null) ?? null,
      recoveryEntries: Array.isArray(data.recovery_entries) ? (data.recovery_entries as RecoveryEntry[]) : [],
    },
    updatedAt: data.updated_at,
  };
}

export async function saveCloudSyncState(supabase: SupabaseClient, userId: string, state: CloudSyncState) {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from("app_sync_states").upsert({
    user_id: userId,
    workouts: state.workouts,
    active_workout: state.activeWorkout,
    recovery_entries: state.recoveryEntries,
    updated_at: updatedAt,
  });

  if (error) throw error;
  return updatedAt;
}
