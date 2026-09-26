# Lovable Cloud Deployment Guide

## Overview
This guide explains how the silo-sachet-sense application is deployed to Lovable Cloud with automatic database migrations.

## Architecture

```
GitHub Repository
    ↓
Lovable Cloud Deployment
    ├── Syncs code changes
    ├── Detects migrations in /supabase/migrations/
    ├── Applies new migrations automatically
    └── Deploys updated application
```

## Database Migrations

### Location
All migrations are stored in: `supabase/migrations/`

### Migration Format
```
YYYYMMDDHHMMSS_descriptive_name.sql
Example: 20260321000000_payment_admin_tables.sql
```

### How Lovable Handles Migrations

1. **Detection**: Lovable scans `/supabase/migrations/` on each deployment
2. **Ordering**: Migrations are applied in chronological order by filename
3. **Verification**: Each migration is checked for syntax errors
4. **Application**: New migrations (not yet applied) are executed
5. **Tracking**: Applied migrations are recorded in `_supabase_migrations` table

## Latest Migration: Payment Admin Tables

### What's New (March 21, 2026)

**Migration File**: `supabase/migrations/20260321000000_payment_admin_tables.sql`

**Creates These Tables**:
- ✅ `payment_notifications` - Payment transaction logs
- ✅ `profiles` - User profile information  
- ✅ `subscriptions` - User subscription status

**Security**:
- ✅ Row-Level Security (RLS) enabled on all tables
- ✅ Authenticated-only access policies
- ✅ User-scoped data access

**Performance**:
- ✅ Indexes on frequently queried columns
- ✅ Optimized foreign key relationships
- ✅ Proper data type constraints

### Deployment Timeline

| Step | Status | Details |
|------|--------|---------|
| 1. Commit to GitHub | ✅ DONE | Migration file in repository |
| 2. Lovable detects change | ✅ AUTO | On next git push |
| 3. Validate migration | ✅ AUTO | Syntax and constraints check |
| 4. Apply to Supabase | ✅ AUTO | Executed on staging/production |
| 5. Deploy app | ✅ AUTO | Application updated with new schema |
| 6. Verify connectivity | ⏭️ MANUAL | Test Payment Admin Portal |

## Deployment Workflow

### For Developers

#### 1. Create a New Migration
```bash
cd silo-sachet-sense
supabase migration new migration_name

# This creates: supabase/migrations/YYYYMMDDHHMMSS_migration_name.sql
```

#### 2. Write SQL in the Migration File
```sql
-- Example migration
CREATE TABLE IF NOT EXISTS public.my_new_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.my_new_table ENABLE ROW LEVEL SECURITY;
```

#### 3. Test Locally
```bash
# Apply to local database
supabase db push

# Verify table exists
supabase db pull
```

#### 4. Commit and Push to GitHub
```bash
git add supabase/migrations/
git commit -m "Add new migration: my_new_table"
git push origin main
```

#### 5. Lovable Deploys Automatically
- Lovable receives GitHub webhook
- Detects changes in `/supabase/migrations/`
- Applies new migrations to staging
- Tests application
- Deploys to production

### For DevOps/CI-CD

**GitHub Actions Integration**:
```yaml
# .github/workflows/lovable-deploy.yml
on:
  push:
    branches: [main]
    paths:
      - 'supabase/migrations/**'
      - 'src/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Lovable
        run: # Lovable webhook triggers automatically
```

## Migration Status

### Completed ✅
- ✅ 20260321000000_payment_admin_tables.sql
  - Payment notifications table
  - User profiles table
  - Subscriptions table
  - All RLS policies
  - Performance indexes

### Pending
- None currently

### Stagings
- Lovable staging environment: Auto-deployed on push
- Lovable production: Auto-deployed after staging validation

## Verification Checklist

After deployment, verify in Supabase Dashboard:

### Check 1: Tables Created
```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('payment_notifications', 'profiles', 'subscriptions');
```
Expected: 3 rows returned

### Check 2: RLS Enabled
```sql
SELECT relname, rowsecurity FROM pg_class 
WHERE relname IN ('payment_notifications', 'profiles', 'subscriptions');
```
Expected: All 3 show `rowsecurity: true`

### Check 3: Policies Active
```sql
SELECT * FROM pg_policies 
WHERE tablename IN ('payment_notifications', 'profiles', 'subscriptions');
```
Expected: Multiple policies listed for each table

### Check 4: Indexes Created
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename IN ('payment_notifications', 'profiles', 'subscriptions');
```
Expected: 6 indexes created

### Check 5: Application Tests
```
1. Open Payment Admin Portal: http://localhost:5175
2. Login with admin account
3. Verify data loads in each tab:
   - Payments tab
   - Users tab
   - Subscriptions tab
4. Check browser console for errors (F12)
```

## Troubleshooting

### Migration Failed to Deploy

**Issue**: Error in Lovable logs  
**Solution**:
1. Check migration file syntax: `sqlparse` or `psql -f file.sql`
2. Verify no duplicate table names
3. Check for RLS policy conflicts
4. Review Lovable deployment logs

### Tables Not Visible in Dashboard

**Issue**: Tables created but not showing in Supabase  
**Solution**:
1. Refresh Supabase dashboard (F5)
2. Clear browser cache
3. Check schema is set to `public`
4. Verify RLS isn't blocking visibility

### Connection Error from Payment Admin

**Issue**: "Failed to load resource: 404"  
**Solution**:
1. Verify migration was deployed
2. Check RLS policies allow authenticated access
3. Verify JWT token is valid
4. Check anon key permissions in Supabase

### Rollback/Undo Migration

If migration causes issues:
```bash
# 1. Create a new migration to revert
supabase migration new rollback_payment_admin_tables

# 2. In the new file, add:
DROP TABLE IF EXISTS public.subscriptions CASCADE;
DROP TABLE IF EXISTS public.payment_notifications CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

# 3. Commit and push
git add supabase/migrations/
git commit -m "Rollback: payment admin tables"
git push origin main
```

## File Structure

```
silo-sachet-sense/
├── supabase/
│   ├── migrations/
│   │   ├── 20260318000000_user_access_control.sql
│   │   ├── 20260321000000_payment_admin_tables.sql    ← LATEST
│   │   └── ... (other migrations)
│   ├── MIGRATIONS_README.md                            ← Migration guide
│   └── config.toml
├── src/
├── package.json
└── ... (other project files)
```

## Key Points for Lovable

✅ **Successfully Configured**:
- Migrations in correct directory: `supabase/migrations/`
- Proper naming convention: `YYYYMMDDHHMMSS_name.sql`
- Idempotent SQL (uses `IF NOT EXISTS`)
- RLS policies included
- No sensitive data in migrations

✅ **Ready for Cloud Deployment**:
- All migrations are committed to GitHub
- Lovable will auto-detect and apply
- No manual intervention required
- Rollback capable if needed

## Support & Documentation

- **Supabase Migrations**: https://supabase.com/docs/guides/cli/migrating
- **Lovable Docs**: https://lovable.dev/docs
- **Local Testing**: `supabase db push` (test migrations locally first)
- **Migration Help**: See `supabase/MIGRATIONS_README.md`

---

**Last Updated**: March 21, 2026  
**Migration Status**: ✅ ALL READY FOR LOVABLE DEPLOYMENT  
**Next Sync**: Automatic when pushed to GitHub
