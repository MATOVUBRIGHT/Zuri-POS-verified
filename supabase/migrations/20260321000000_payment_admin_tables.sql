-- Payment Admin Portal Tables Setup
-- Apply this migration to set up the payment admin system

-- 1. Create payment_notifications table
CREATE TABLE IF NOT EXISTS public.payment_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT,
    amount NUMERIC(15,2),
    currency TEXT DEFAULT 'UGX',
    provider TEXT, -- 'stripe', 'paypal', 'momo', 'bank_transfer', etc.
    transaction_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending', -- 'pending', 'verified', 'rejected', 'completed', 'failed'
    metadata JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    phone TEXT,
    role TEXT DEFAULT 'user', -- 'user', 'admin', 'vendor'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create subscriptions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id TEXT,
    status TEXT DEFAULT 'inactive', -- 'active', 'inactive', 'expired', 'canceled'
    current_period_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- 4. Enable RLS on payment_notifications
ALTER TABLE public.payment_notifications ENABLE ROW LEVEL SECURITY;

-- 5. Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 6. Enable RLS on subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for payment_notifications
DROP POLICY IF EXISTS "Allow authenticated users to view payment notifications" ON public.payment_notifications;
CREATE POLICY "Allow authenticated users to view payment notifications" ON public.payment_notifications
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to insert payment notifications" ON public.payment_notifications;
CREATE POLICY "Allow authenticated users to insert payment notifications" ON public.payment_notifications
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated users to update payment notifications" ON public.payment_notifications;
CREATE POLICY "Allow authenticated users to update payment notifications" ON public.payment_notifications
    FOR UPDATE USING (auth.role() = 'authenticated');

-- 8. Create RLS policies for profiles
DROP POLICY IF EXISTS "Allow users to view own profile" ON public.profiles;
CREATE POLICY "Allow users to view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow users to update own profile" ON public.profiles;
CREATE POLICY "Allow users to update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 9. Create RLS policies for subscriptions
DROP POLICY IF EXISTS "Allow users to view own subscriptions" ON public.subscriptions;
CREATE POLICY "Allow users to view own subscriptions" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow users to update own subscriptions" ON public.subscriptions;
CREATE POLICY "Allow users to update own subscriptions" ON public.subscriptions
    FOR UPDATE USING (auth.uid() = user_id);

-- 10. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_notifications_created_at ON public.payment_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_notifications_user_id ON public.payment_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_notifications_status ON public.payment_notifications(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON public.subscriptions(updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
