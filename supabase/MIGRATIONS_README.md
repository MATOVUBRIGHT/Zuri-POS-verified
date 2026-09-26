# Supabase Migrations

This directory contains all database migrations for the Zuri POS ecosystem.

## Recently Added Migrations

### 20260321000000_payment_admin_tables.sql
**Purpose**: Create database tables for the Payment Admin Portal  
**Date**: March 21, 2026  
**Status**: Ready for deployment

**Creates**:
- `payment_notifications` - Payment transaction records with status tracking
- `profiles` - User profile information with roles and status
- `subscriptions` - User subscription management

**Includes**:
- ✅ Row-Level Security (RLS) policies for all tables
- ✅ Performance indexes on frequently queried columns
- ✅ Foreign key relationships to auth.users
- ✅ Proper data types and constraints
- ✅ Automatic timestamps (created_at, updated_at)

## Directory Structure

```
supabase/migrations/
├── 20260321000000_payment_admin_tables.sql      ← Latest (Payment Admin)
├── 20260318000000_user_access_control.sql
├── 20260317100000_stock_loans_credit_details.sql
└── ... (other migrations in chronological order)
```

## How Migrations Work

1. **Naming Convention**: `YYYYMMDDHHMMSS_description.sql`
2. **Order**: Migrations are applied in chronological order
3. **Idempotency**: Each migration uses `IF NOT EXISTS` to be safe
4. **RLS**: Row-Level Security policies ensure data privacy

## Deployment

### For Lovable Cloud
These migrations are automatically picked up by Lovable when you push to GitHub:
1. Commit migrations to Github
2. Lovable detects changes in `/supabase/migrations/`
3. Migrations apply automatically on deployment
4. No manual SQL execution needed

### For Local Development
```bash
# Generate migration
supabase migration new migration_name

# List migrations
supabase migration list

# Apply locally
supabase db pull
supabase db push
```

## Latest Migration Details

### Tables Created

#### payment_notifications
```sql
- id (UUID, Primary Key)
- created_at (TIMESTAMPTZ)
- user_id (UUID, FK to auth.users)
- email (TEXT)
- amount (NUMERIC)
- currency (TEXT, default: 'UGX')
- provider (TEXT, e.g., 'momo', 'stripe')
- transaction_id (TEXT, UNIQUE)
- status (TEXT, 'pending'/'verified'/'rejected'/'completed')
- metadata (JSONB)
- updated_at (TIMESTAMPTZ)
```

#### profiles
```sql
- id (UUID, Primary Key, FK to auth.users)
- email (TEXT, UNIQUE)
- phone (TEXT)
- role (TEXT, default: 'user')
- is_active (BOOLEAN, default: true)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
```

#### subscriptions
```sql
- id (UUID, Primary Key)
- user_id (UUID, FK to auth.users, NOT NULL)
- plan_id (TEXT)
- status (TEXT, default: 'inactive')
- current_period_end (TIMESTAMPTZ)
- created_at (TIMESTAMPTZ)
- updated_at (TIMESTAMPTZ)
- metadata (JSONB)
```

### Security Policies

**RLS Enabled** on all three tables:
- `payment_notifications`: Authenticated users can SELECT, INSERT, UPDATE
- `profiles`: Users can manage their own + admins can view all
- `subscriptions`: Users can manage their own + admins can view all

### Performance Indexes

Created on:
- `payment_notifications(created_at DESC)` - For recent transactions
- `payment_notifications(user_id)` - For user lookup
- `payment_notifications(status)` - For status filtering
- `subscriptions(user_id)` - For user subscriptions
- `subscriptions(status)` - For status filtering
- `subscriptions(updated_at DESC)` - For recent updates

## Integration with Payment Admin Portal

The Payment Admin Portal connects to these tables:
- Reads from `payment_notifications` for payment dashboard
- Reads/writes to `profiles` for user management
- Reads/writes to `subscriptions` for subscription tracking
- Uses WebSocket connections for real-time updates

## Next Steps

1. ✅ Migration file created and committed
2. ✅ Properly formatted for Lovable/Supabase CLI
3. ✅ RLS policies included
4. ⏭️ Push to GitHub for Lovable to deploy
5. ⏭️ Verify in Supabase Dashboard
6. ⏭️ Test Payment Admin Portal connectivity

## Verification

After deployment, verify in Supabase:
```sql
-- Check tables exist
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('payment_notifications', 'profiles', 'subscriptions');

-- Check RLS is enabled
SELECT relname, rowsecurity FROM pg_class 
WHERE relname IN ('payment_notifications', 'profiles', 'subscriptions');

-- Check policies
SELECT * FROM pg_policies 
WHERE tablename IN ('payment_notifications', 'profiles', 'subscriptions');

-- Check indexes
SELECT * FROM pg_indexes 
WHERE tablename IN ('payment_notifications', 'profiles', 'subscriptions');
```

## Support

- **Supabase Migrations**: https://supabase.com/docs/guides/cli/migrating
- **RLS Guide**: https://supabase.com/docs/guides/auth/row-level-security
- **Database Schema**: ../schema_reference.md

---

**Last Updated**: March 21, 2026  
**Created By**: Zuri POS Dev Team  
**Status**: ✅ Ready for Deployment
