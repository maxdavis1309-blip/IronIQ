import type { CloudSyncState, WorkoutLog } from "@/lib/types";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminSearchParams = Promise<{
  passcode?: string;
}>;

type AppSyncStateRow = {
  user_id: string;
  workouts: unknown;
  active_workout: unknown;
  recovery_entries: unknown;
  updated_at: string | null;
};

export default async function CoachAdminPage({ searchParams }: { searchParams: AdminSearchParams }) {
  const { passcode } = await searchParams;
  const expectedPasscode = process.env.IRONIQ_ADMIN_PASSCODE;
  const isAllowed = Boolean(expectedPasscode && passcode === expectedPasscode);

  if (!isAllowed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 text-zinc-100 sm:px-6">
        <header className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">IronIQ</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Coach Admin</h1>
          <p className="mt-2 text-sm text-zinc-400">Private cloud sync viewer.</p>
        </header>
        <form className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
            Passcode
            <input
              name="passcode"
              type="password"
              className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-black/40 px-3 text-base normal-case tracking-normal text-zinc-100"
            />
          </label>
          <button type="submit" className="mt-3 min-h-12 w-full rounded-2xl bg-emerald-200 px-4 font-semibold text-zinc-950">
            Open admin
          </button>
        </form>
      </main>
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return <AdminShell title="Supabase admin not configured" body="Add SUPABASE_SERVICE_ROLE_KEY and IRONIQ_ADMIN_PASSCODE in Vercel env." />;
  }

  const { data, error } = await supabase
    .from("app_sync_states")
    .select("user_id, workouts, active_workout, recovery_entries, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    return <AdminShell title="Could not load cloud state" body={error.message} />;
  }

  const rows = (data ?? []).map(normalizeSyncRow);
  const latest = rows[0];
  const latestWorkout = latest?.state.workouts[0] ?? null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-4 pb-10 pt-8 text-zinc-100 sm:px-6">
      <header className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">IronIQ</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Coach Admin</h1>
        <p className="mt-2 text-sm text-zinc-400">Private view of synced workout state. Do not share this page URL.</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <AdminStat label="users" value={rows.length} />
        <AdminStat label="workouts" value={latest?.state.workouts.length ?? 0} />
        <AdminStat label="active" value={latest?.state.activeWorkout ? "yes" : "no"} />
        <AdminStat label="recovery" value={latest?.state.recoveryEntries.length ?? 0} />
      </div>

      {latest && (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Latest cloud write</div>
          <div className="mt-1 text-sm text-zinc-300">{latest.updatedAt ? new Date(latest.updatedAt).toLocaleString() : "No timestamp"}</div>
          <div className="mt-1 text-xs text-zinc-500">User {latest.userId}</div>
        </section>
      )}

      {latestWorkout ? <WorkoutSummary workout={latestWorkout} /> : <AdminShell title="No workouts synced yet" body="Finish a workout on your phone after signing in." />}

      <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Raw cloud state</div>
        <pre className="max-h-[32rem] overflow-auto rounded-2xl bg-black/40 p-3 text-xs leading-5 text-zinc-300">
          {JSON.stringify(latest?.state ?? { workouts: [], activeWorkout: null, recoveryEntries: [] }, null, 2)}
        </pre>
      </section>
    </main>
  );
}

function AdminShell({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-8 text-zinc-100 sm:px-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-zinc-400">{body}</p>
      </div>
    </main>
  );
}

function AdminStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-100">{value}</div>
    </div>
  );
}

function WorkoutSummary({ workout }: { workout: WorkoutLog }) {
  return (
    <section className="mt-4 rounded-2xl border border-emerald-200/20 bg-emerald-200/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Latest workout</div>
          <h2 className="mt-1 text-2xl font-semibold">{workout.aiSummary}</h2>
          <p className="mt-1 text-sm text-zinc-400">{workout.workoutDate} - {workout.workoutType}</p>
        </div>
        <div className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-zinc-300">{workout.exercises.length} exercises</div>
      </div>

      <div className="mt-4 space-y-3">
        {workout.exercises.map((exercise) => (
          <div key={`${workout.id}-${exercise.normalizedExerciseName}`} className="rounded-2xl bg-black/30 p-3">
            <div className="font-semibold text-amber-100">{exercise.exerciseName}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {exercise.sets.map((set) => (
                <span key={set.id} className="rounded-full bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300">
                  {set.weight ?? "BW"} x {set.reps ?? "?"}
                  {set.notes ? ` - ${set.notes}` : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function normalizeSyncRow(row: AppSyncStateRow) {
  return {
    userId: row.user_id,
    updatedAt: row.updated_at,
    state: {
      workouts: Array.isArray(row.workouts) ? (row.workouts as WorkoutLog[]) : [],
      activeWorkout: (row.active_workout as WorkoutLog | null) ?? null,
      recoveryEntries: Array.isArray(row.recovery_entries) ? row.recovery_entries : [],
    } satisfies CloudSyncState,
  };
}
