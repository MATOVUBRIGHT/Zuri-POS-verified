-- Add allowed_pages column to staff table for persistent page-level permissions
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS allowed_pages jsonb DEFAULT '[]'::jsonb;