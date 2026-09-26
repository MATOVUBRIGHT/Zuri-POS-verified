-- User Access Control Enhancement Migration
-- This migration adds tables for user access management, payment tracking, and access suspension

-- Create user_access_logs table to track access changes
CREATE TABLE IF NOT EXISTS public.user_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'verified', 'suspended', 'deleted', 'reactivated'
  reason TEXT,
  performed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create user_access_suspension table for temporary access pauses
CREATE TABLE IF NOT EXISTS public.user_access_suspension (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  suspended_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  suspended_until TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  suspended_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add new columns to user_subscriptions for better tracking
ALTER TABLE public.user_subscriptions 
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

-- Add new columns to profiles for better user management
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active'; -- 'active', 'suspended', 'deleted'

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_access_logs_user_id ON public.user_access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_access_logs_created_at ON public.user_access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_access_suspension_user_id ON public.user_access_suspension(user_id);
CREATE INDEX IF NOT EXISTS idx_user_access_suspension_active ON public.user_access_suspension(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_verified ON public.user_subscriptions(verified_at);

-- Enable RLS
ALTER TABLE public.user_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_suspension ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_access_logs
CREATE POLICY "Admins can view all access logs"
ON public.user_access_logs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert access logs"
ON public.user_access_logs FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_access_suspension
CREATE POLICY "Admins can view all suspensions"
ON public.user_access_suspension FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage suspensions"
ON public.user_access_suspension FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Function to check if user is suspended
CREATE OR REPLACE FUNCTION public.is_user_suspended(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_access_suspension
    WHERE user_id = check_user_id
      AND is_active = true
      AND suspended_until > now()
  )
$$;

-- Function to automatically deactivate expired suspensions
CREATE OR REPLACE FUNCTION public.deactivate_expired_suspensions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_access_suspension
  SET is_active = false
  WHERE is_active = true
    AND suspended_until <= now();
END;
$$;

-- Create a trigger to update profiles when subscription is verified
CREATE OR REPLACE FUNCTION public.update_profile_on_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verified_at IS NOT NULL AND OLD.verified_at IS NULL THEN
    UPDATE public.profiles
    SET account_status = 'active',
        is_active = true
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_profile_on_verification
AFTER UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_profile_on_verification();

-- Comment on tables
COMMENT ON TABLE public.user_access_logs IS 'Tracks all access control actions performed by admins';
COMMENT ON TABLE public.user_access_suspension IS 'Manages temporary user access suspensions';
COMMENT ON COLUMN public.user_subscriptions.verified_at IS 'Timestamp when admin verified the payment';
COMMENT ON COLUMN public.user_subscriptions.verified_by IS 'Admin user ID who verified the payment';
COMMENT ON COLUMN public.profiles.account_status IS 'Current account status: active, suspended, or deleted';
