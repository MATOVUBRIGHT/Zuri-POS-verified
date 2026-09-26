-- Add access_password_hash to stores table
-- Store owners can set a password; anyone linking must provide it
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS access_password_hash TEXT DEFAULT NULL;

-- Helper: check if a store has a password set
COMMENT ON COLUMN public.stores.access_password_hash IS
  'bcrypt hash of the store access password. NULL means no password required to link.';
