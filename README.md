# IronIQ

Premium mobile-first lifting intelligence app. The product goal is simple: log a messy workout note in under 10 seconds and let the app organize, remember, analyze, and coach from it.

## Stack

- Next.js App Router
- React + TypeScript
- Tailwind CSS
- Supabase-ready schema
- Mock AI parser and coach service
- PWA manifest

## Run

```powershell
cd C:\Users\maxda\Codex\IronIQ
"C:\Program Files\nodejs\npm.cmd" run dev
```

Then open:

```text
http://localhost:3000
```

## Current MVP

- Today / Quick Log with natural language workout entry
- Mock parse review with confidence, structured exercises, warnings, and notes
- History feed with raw notes preserved
- Exercise Intelligence page with best sets, e1RM, chart placeholder, next target
- Ask Coach chat with mock memory-aware answers and citations
- Progress, Body & Recovery, and Settings/Profile foundations
- API routes:
  - `POST /api/ai/parse-workout`
  - `POST /api/ai/coach`
- Supabase SQL:
  - `supabase/schema.sql`
  - `supabase/seed.sql`

## Architecture Notes

The AI layer is intentionally abstracted behind server-side services in `src/lib/ai`. Today it uses deterministic mock logic. Later, swap the internals for OpenAI, Claude, or another model without changing the UI contract.

Raw notes are preserved on every workout. Parsed structured data should be treated as editable and improvable, never as the only source of truth.

## Next Steps

- Create a Supabase project and run `supabase/schema.sql`.
- Add these environment variables locally and in Vercel:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- In Supabase Auth, enable email magic links.
- Add your deployed Vercel URL to Supabase Auth redirect URLs.
- IronIQ now syncs app state through `app_sync_states` when signed in.
- Later, fan synced JSON into normalized `workout_logs`, `exercise_sets`, and `body_metrics` for deeper analytics.
- Add an editable parse review screen.
- Add real AI provider adapter behind the parser service.
- Add offline-first local queue for gym logging.
