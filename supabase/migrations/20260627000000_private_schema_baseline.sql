


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_user_organizations"() RETURNS "uuid"[]
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT coalesce(array_agg(organization_id), '{}'::uuid[]) 
    FROM public.organization_members 
    WHERE user_id = (SELECT auth.uid());
$$;


ALTER FUNCTION "private"."get_user_organizations"() OWNER TO "postgres";



