-- Keep the shorter, tenant-standardized *_org_id index only when an identical
-- *_organization_id index exists on the same table.
DO $$
DECLARE
    duplicate_index record;
BEGIN
    FOR duplicate_index IN
        SELECT namespace.nspname AS schema_name, duplicate_class.relname AS index_name
        FROM pg_index AS duplicate
        JOIN pg_class AS duplicate_class ON duplicate_class.oid = duplicate.indexrelid
        JOIN pg_namespace AS namespace ON namespace.oid = duplicate_class.relnamespace
        WHERE namespace.nspname = 'public'
          AND duplicate_class.relname LIKE 'idx%_organization_id'
          AND EXISTS (
              SELECT 1
              FROM pg_index AS canonical
              JOIN pg_class AS canonical_class ON canonical_class.oid = canonical.indexrelid
              WHERE canonical.indrelid = duplicate.indrelid
                AND canonical_class.relname = regexp_replace(duplicate_class.relname, '_organization_id$', '_org_id')
                AND canonical.indisunique = duplicate.indisunique
                AND canonical.indkey = duplicate.indkey
                AND canonical.indclass = duplicate.indclass
                AND canonical.indcollation = duplicate.indcollation
                AND canonical.indoption = duplicate.indoption
                AND canonical.indpred IS NOT DISTINCT FROM duplicate.indpred
          )
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I.%I', duplicate_index.schema_name, duplicate_index.index_name);
    END LOOP;
END $$;
