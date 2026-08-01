-- Replace the deprecated auth.role() predicate with an explicit role target
-- and an ownership check for profile reads.
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);
