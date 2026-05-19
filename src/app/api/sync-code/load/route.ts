import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { CloudSyncState, RecoveryEntry, WorkoutLog } from "@/lib/types";

type AppSyncRow = {
  workouts: unknown;
  active_workout: unknown;
  recovery_entries: unknown;
  updated_at: string | null;
};

export async function POST(request: Request) {
  const { syncCode } = (await request.json()) as { syncCode?: string };
  const syncUser = getSyncUser(syncCode);
  if (!syncUser) return NextResponse.json({ error: "Enter a sync code with at least 6 characters." }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Cloud sync is not configured." }, { status: 500 });

  const userResult = await ensureSyncUser(syncUser.id);
  if (userResult.error) return NextResponse.json({ error: userResult.error }, { status: 500 });

  const { data, error } = await supabase
    .from("app_sync_states")
    .select("workouts, active_workout, recovery_entries, updated_at")
    .eq("user_id", syncUser.id)
    .maybeSingle<AppSyncRow>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const state: CloudSyncState | null = data
    ? {
        workouts: Array.isArray(data.workouts) ? (data.workouts as WorkoutLog[]) : [],
        activeWorkout: (data.active_workout as WorkoutLog | null) ?? null,
        recoveryEntries: Array.isArray(data.recovery_entries) ? (data.recovery_entries as RecoveryEntry[]) : [],
      }
    : null;

  return NextResponse.json({ state, updatedAt: data?.updated_at ?? null });
}

function getSyncUser(syncCode?: string) {
  const code = syncCode?.trim();
  if (!code || code.length < 6) return null;
  const hash = createHash("sha256").update(code).digest("hex");
  return {
    id: `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hash.slice(18, 20)}-${hash.slice(20, 32)}`,
  };
}

async function ensureSyncUser(userId: string) {
  const supabase = createAdminClient();
  if (!supabase) return { error: "Cloud sync is not configured." };

  const existing = await supabase.auth.admin.getUserById(userId);
  if (existing.data.user) return { error: null };

  const created = await supabase.auth.admin.createUser({
    id: userId,
    email: `sync-${userId}@ironiq.local`,
    email_confirm: true,
    user_metadata: { source: "ironiq-sync-code" },
  });

  return { error: created.error?.message ?? null };
}
