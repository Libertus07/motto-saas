DO $migration$
DECLARE
    updated_bucket_count integer;
BEGIN
    INSERT INTO storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
    )
    VALUES
        (
            'motto_assets',
            'motto_assets',
            false,
            3145728,
            ARRAY[
                'image/jpeg',
                'image/png',
                'image/webp',
                'application/pdf',
                'application/xml',
                'text/xml',
                'application/json',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ]::text[]
        ),
        (
            'receipts',
            'receipts',
            false,
            10485760,
            ARRAY[
                'image/jpeg',
                'image/png',
                'image/webp',
                'application/pdf',
                'application/xml',
                'text/xml',
                'application/json',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ]::text[]
        )
    ON CONFLICT (id)
    DO UPDATE SET
        public = EXCLUDED.public,
        file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

    GET DIAGNOSTICS updated_bucket_count = ROW_COUNT;
    IF updated_bucket_count <> 2 THEN
        RAISE EXCEPTION 'Expected to enforce exactly two financial document buckets, wrote %',
            updated_bucket_count;
    END IF;
END;
$migration$;

DROP POLICY IF EXISTS "Giris Yapanlar Yukleyebilir" ON storage.objects;
DROP POLICY IF EXISTS "Sahibi Guncelleyebilir" ON storage.objects;
DROP POLICY IF EXISTS "Sahibi Silebilir" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads 1lnm9mj_0" ON storage.objects;
DROP POLICY IF EXISTS "Allow Uploads 1lnm9mj_1" ON storage.objects;
DROP POLICY IF EXISTS "Public Okuma Izinleri" ON storage.objects;
