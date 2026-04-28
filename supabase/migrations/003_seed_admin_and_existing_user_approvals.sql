-- =============================================================================
-- Make the root admin always approved, and promote any pre-existing pending
-- profiles to approved (one-time backfill so existing inspectors/engineers
-- aren't accidentally locked out by the verification_status default).
-- =============================================================================

UPDATE public.profiles
SET role = 'admin', verification_status = 'approved'
WHERE email = 'hajinomoto69@gmail.com';

UPDATE public.profiles
SET verification_status = 'approved'
WHERE verification_status = 'pending';

-- =============================================================================
-- Make the new-user trigger explicit about the pending default for clarity.
-- =============================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, lgu_code, verification_status)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        CASE
            WHEN NEW.raw_user_meta_data->>'role' IS NOT NULL
                 AND NEW.raw_user_meta_data->>'role' <> ''
            THEN (NEW.raw_user_meta_data->>'role')::user_role
            ELSE 'inspector'::user_role
        END,
        COALESCE(NEW.raw_user_meta_data->>'lgu_code', ''),
        CASE
            WHEN COALESCE(NEW.email, '') = 'hajinomoto69@gmail.com' THEN 'approved'
            ELSE 'pending'
        END
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Prevent non-admins from self-approving by changing their own
-- verification_status. Only admins (or service-role bypass) may flip it.
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_verification_status_admin_only()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Only admins can change verification_status';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_verification_status_admin_only ON public.profiles;
CREATE TRIGGER profiles_verification_status_admin_only
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION enforce_verification_status_admin_only();
