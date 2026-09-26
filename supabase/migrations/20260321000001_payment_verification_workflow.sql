-- Payment Verification Workflow Enhancement
-- This migration connects payment verification to subscription activation
-- Ensures real-time updates flow from Payment Admin Portal to all apps

-- 1. Add payment_reference to subscriptions table (if not exists)
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS payment_reference UUID REFERENCES public.payment_notifications(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Create user_subscriptions alias table for backward compatibility
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payment_id UUID REFERENCES public.payment_notifications(id) ON DELETE SET NULL,
    plan_id TEXT DEFAULT 'basic',
    status TEXT DEFAULT 'pending', -- 'pending', 'active', 'expired', 'cancelled'
    current_period_end TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

-- 2a. If user_subscriptions already existed (e.g. 20260204075643), CREATE TABLE above is a no-op — add missing columns
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS payment_id UUID REFERENCES public.payment_notifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3. Enable RLS on user_subscriptions
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies for user_subscriptions
DROP POLICY IF EXISTS "Allow users to view own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Allow users to view own subscriptions" ON public.user_subscriptions
    FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow users to update own subscriptions" ON public.user_subscriptions;
CREATE POLICY "Allow users to update own subscriptions" ON public.user_subscriptions
    FOR UPDATE USING (auth.uid() = user_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow users to insert subscriptions" ON public.user_subscriptions;
CREATE POLICY "Allow users to insert subscriptions" ON public.user_subscriptions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 5. Create function to verify payment and activate subscription
CREATE OR REPLACE FUNCTION public.verify_payment_and_activate_subscription(
    p_payment_id UUID,
    p_verified_by UUID
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    subscription_id UUID,
    user_id UUID
) AS $$
DECLARE
    v_payment_record RECORD;
    v_subscription_id UUID;
    v_current_period_end TIMESTAMPTZ;
BEGIN
    -- Get payment details
    SELECT id, user_id, status, amount FROM public.payment_notifications 
    WHERE id = p_payment_id INTO v_payment_record;

    IF v_payment_record IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Payment not found'::TEXT, NULL::UUID, NULL::UUID;
        RETURN;
    END IF;

    IF v_payment_record.status = 'verified' THEN
        RETURN QUERY SELECT FALSE, 'Payment already verified'::TEXT, NULL::UUID, NULL::UUID;
        RETURN;
    END IF;

    -- Update payment status to verified
    UPDATE public.payment_notifications
    SET status = 'verified', updated_at = NOW()
    WHERE id = p_payment_id;

    -- Calculate period end (30 days from now for basic plan)
    v_current_period_end := NOW() + INTERVAL '30 days';

    -- Check if user already has an active subscription
    SELECT id INTO v_subscription_id FROM public.user_subscriptions
    WHERE user_id = v_payment_record.user_id 
      AND status = 'active'
    LIMIT 1;

    IF v_subscription_id IS NULL THEN
        -- Create new subscription
        INSERT INTO public.user_subscriptions (
            user_id,
            payment_id,
            status,
            current_period_end,
            verified_at,
            expires_at,
            metadata
        ) VALUES (
            v_payment_record.user_id,
            p_payment_id,
            'active',
            v_current_period_end,
            NOW(),
            v_current_period_end,
            JSONB_BUILD_OBJECT(
                'verified_by', p_verified_by,
                'payment_amount', v_payment_record.amount,
                'verification_date', NOW(),
                'plan_slug', 'basic'
            )
        )
        RETURNING id INTO v_subscription_id;
    ELSE
        -- Update existing subscription
        UPDATE public.user_subscriptions
        SET 
            status = 'active',
            current_period_end = v_current_period_end,
            expires_at = v_current_period_end,
            verified_at = NOW(),
            payment_id = p_payment_id,
            metadata = JSONB_BUILD_OBJECT(
                'verified_by', p_verified_by,
                'payment_amount', v_payment_record.amount,
                'verification_date', NOW()
            ),
            updated_at = NOW()
        WHERE id = v_subscription_id;
    END IF;

    -- Also update the subscriptions table for consistency
    INSERT INTO public.subscriptions (
        user_id,
        payment_reference,
        plan_id,
        status,
        current_period_end,
        verified_by,
        verified_at,
        metadata
    ) VALUES (
        v_payment_record.user_id,
        p_payment_id,
        'basic',
        'active',
        v_current_period_end,
        p_verified_by,
        NOW(),
        JSONB_BUILD_OBJECT('source', 'payment_verification')
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        status = 'active',
        verified_at = NOW(),
        verified_by = p_verified_by,
        updated_at = NOW();

    RETURN QUERY SELECT TRUE, 'Payment verified and subscription activated'::TEXT, v_subscription_id, v_payment_record.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Create function to reject payment and cancel subscription
CREATE OR REPLACE FUNCTION public.reject_payment_and_cancel_subscription(
    p_payment_id UUID,
    p_verified_by UUID,
    p_reason TEXT DEFAULT ''
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    payment_id UUID
) AS $$
DECLARE
    v_payment_record RECORD;
    v_user_id UUID;
BEGIN
    -- Get payment details
    SELECT id, user_id, status FROM public.payment_notifications 
    WHERE id = p_payment_id INTO v_payment_record;

    IF v_payment_record IS NULL THEN
        RETURN QUERY SELECT FALSE, 'Payment not found'::TEXT, NULL::UUID;
        RETURN;
    END IF;

    -- Update payment status to rejected
    UPDATE public.payment_notifications
    SET status = 'rejected', metadata = JSONB_BUILD_OBJECT(
        'rejected_by', p_verified_by,
        'rejection_reason', p_reason,
        'rejection_date', NOW()
    ), updated_at = NOW()
    WHERE id = p_payment_id;

    -- Cancel any associated subscriptions
    UPDATE public.user_subscriptions
    SET status = 'cancelled', updated_at = NOW()
    WHERE payment_id = p_payment_id
      AND status IN ('pending', 'active');

    RETURN QUERY SELECT TRUE, 'Payment rejected and subscription cancelled'::TEXT, p_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_payment_id ON public.user_subscriptions(payment_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_reference ON public.subscriptions(payment_reference);

-- 8. Grant permissions
GRANT EXECUTE ON FUNCTION public.verify_payment_and_activate_subscription(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_payment_and_cancel_subscription(UUID, UUID, TEXT) TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_subscriptions TO authenticated;
