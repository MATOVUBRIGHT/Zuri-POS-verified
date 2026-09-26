# Supabase keys & security

## What belongs in the browser (Vite / Electron renderer)

- **`VITE_SUPABASE_URL`** — public project URL.
- **`VITE_SUPABASE_PUBLISHABLE_KEY`** (new format, `sb_publishable_…`) **or** **`VITE_SUPABASE_ANON_KEY`** (JWT) — these are **designed to be embedded in client apps**. They are **not** secret in the same way as a database password.

Protection for your data comes from:

- **Row Level Security (RLS)** on all tables
- **Policies** that only allow the right users to read/write rows
- Never using the **service role** key in the frontend

## What must never go in the frontend

- **`service_role` / secret API keys** — server-side or Edge Functions only, via env vars configured in the Supabase dashboard (not `VITE_*`).
- **Database password** — only in Supabase / connection strings on the server.

## Repo hygiene

- Keep real values in **`.env.local`** only (gitignored).
- Do **not** commit `.env` files that contain keys.
- If keys are ever leaked in chat or a public repo, **rotate** them in Supabase: Project Settings → API → reset anon/publishable as needed.

## Edge Functions

Functions under `supabase/functions/` use **`SUPABASE_SERVICE_ROLE_KEY`** from the Supabase project secrets (set when you deploy functions), never from the React app.
