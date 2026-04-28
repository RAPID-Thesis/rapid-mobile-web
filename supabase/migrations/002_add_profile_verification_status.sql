ALTER TABLE public.profiles
ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'
CHECK (verification_status IN ('pending', 'approved', 'rejected'));

-- Keep existing accounts accessible; new signups default to pending.
UPDATE public.profiles
SET verification_status = 'approved'
WHERE verification_status = 'pending';

CREATE INDEX idx_profiles_verification_status
ON public.profiles(verification_status);
