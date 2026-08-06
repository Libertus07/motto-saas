-- Functions created by the postgres owner previously inherited EXECUTE grants
-- for both anon and PUBLIC. Keep database RPCs behind an authenticated session
-- unless a future migration deliberately grants narrower access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

NOTIFY pgrst, 'reload schema';
