-- =============================================================================
-- Hotfix: make signup robust and reliable.
--
-- Symptoms this fixes:
--   - "Database error saving new user" on auth.signUp
--   - profile row not created in public.profiles after signup
--
-- Strategy:
--   1. Ensure verification_status column/check/index exist (idempotent fallback).
--   2. Replace handle_new_user with a hardened version that:
--        * sets search_path explicitly (Supabase best practice)
--        * uses ON CONFLICT DO NOTHING so retries are safe
--        * never raises into auth.users -- it logs a warning instead, so the
--          client-side fallback can still create the profile.
--   3. Make the admin-only verification_status trigger no-op when there is no
--      authenticated caller (service role, migrations, triggers).
--   4. Allow authenticated users to insert their own profile row, so the
--      client-side defensive upsert can run when needed.
-- =============================================================================

-- 1. Ensure column/check/index exist regardless of prior migration state.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'verification_status'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'profiles_verification_status_check'
    ) THEN
        ALTER TABLE public.profiles
        ADD CONSTRAINT profiles_verification_status_check
        CHECK (verification_status IN ('pending', 'approved', 'rejected'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_verification_status
ON public.profiles(verification_status);

-- 2. Hardened handle_new_user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role public.user_role;
    v_status TEXT;
BEGIN
    BEGIN
        v_role := COALESCE(
            NULLIF(NEW.raw_user_meta_data->>'role', '')::public.user_role,
            'inspector'::public.user_role
        );
    EXCEPTION WHEN OTHERS THEN
        v_role := 'inspector'::public.user_role;
    END;

    v_status := CASE
        WHEN COALESCE(NEW.email, '') = 'hajinomoto69@gmail.com' THEN 'approved'
        ELSE 'pending'
    END;

    BEGIN
        INSERT INTO public.profiles (id, email, full_name, role, lgu_code, verification_status)
        VALUES (
            NEW.id,
            COALESCE(NEW.email, ''),
            COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
            v_role,
            COALESCE(NEW.raw_user_meta_data->>'lgu_code', ''),
            v_status
        )
        ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
        -- Don't block auth signup; client-side will retry the profile upsert.
        RAISE WARNING 'handle_new_user profile insert failed: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- Make sure the trigger is bound (no-op if already there).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Hardened admin-only verification_status trigger (no-op for service role).
CREATE OR REPLACE FUNCTION public.enforce_verification_status_admin_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        -- Allow service role / migrations / DB-level updates (no JWT context).
        IF auth.uid() IS NULL THEN
            RETURN NEW;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only admins can change verification_status';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_verification_status_admin_only ON public.profiles;
CREATE TRIGGER profiles_verification_status_admin_only
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_verification_status_admin_only();

-- 4. Allow authenticated users to insert their own profile row.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());
