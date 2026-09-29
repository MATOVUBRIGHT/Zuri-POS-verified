# Apply database migrations to your Supabase project

Project ref is set in `supabase/config.toml` as `project_id`.

## Option A — Supabase CLI (recommended)

1. Install CLI: https://supabase.com/docs/guides/cli
2. Login: `supabase login`
3. From this app folder (`Zuri POS Desktop App`):

```bash
cd "Zuri POS Desktop App"
supabase link --project-ref itvordesxygnktqchqgs
supabase db push
```

`db push` applies all SQL files in `supabase/migrations/` in filename order.

If a migration fails, read the error in the terminal, fix the SQL or baseline the project, then retry.

## Option B — SQL Editor (manual)

1. Open **Supabase Dashboard → SQL Editor** for project `itvordesxygnktqchqgs`.
2. Run each file under `supabase/migrations/` **in chronological order** (by the `YYYYMMDDHHMMSS_name.sql` prefix).
3. Skip or adjust any migration that references objects already created.

> **Note:** There are many migrations; CLI `db push` is easier than pasting 60+ files by hand.

## Payment admin extras

After core migrations, run `payment-admin-portal/supabase-setup.sql` once if you use the Payment Admin Portal (payments / subscriptions tables + RPCs).

## Troubleshooting

### Migration order (same timestamp)

`db push` sorts migration files **lexicographically by full filename**. If two files share the same `YYYYMMDDHHMMSS_` prefix, the part after the underscore determines order (e.g. `..._barcode_enhancement.sql` runs before `..._f2f652a6-....sql`). The barcode enhancement was renamed to `20251003193733_barcode_enhancement.sql` so it runs **after** `20251003193732_f2f652a6-....sql`, which creates `public.inventory`.

If you add migrations, give each file a **unique** timestamp or ensure the sort order matches table dependencies.

### `apply_schema_fix.sql` is skipped

Files in `supabase/migrations/` must match `YYYYMMDDHHMMSS_name.sql`. `apply_schema_fix.sql` has no timestamp, so the CLI skips it. Use it only in the **SQL Editor** (copy/paste), or rename it with a timestamp if you intend it to run via `db push` (check for overlap with other migrations first).

### Push failed mid-way

If a migration failed, fix the SQL locally, then run `supabase db push` again. If the remote migration history is inconsistent, see [Supabase migration repair](https://supabase.com/docs/guides/cli/managing-environments#migration-repair) or ask in the Supabase Discord/docs for your case.
