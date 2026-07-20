import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const query = `
    CREATE OR REPLACE FUNCTION test_del() RETURNS json AS $$
    DECLARE
        v_mov record;
        result json := '[]'::json;
    BEGIN
        FOR v_mov IN SELECT * FROM account_movements WHERE source_type = 'investment' LIMIT 1
        LOOP
            DELETE FROM account_movements WHERE id = v_mov.id;
            result := jsonb_set(result, '{0}', to_jsonb(v_mov));
        END LOOP;
        RETURN result;
    END;
    $$ LANGUAGE plpgsql;
  `;

  const { data, error } = await supabase.rpc('execute_query', { query });
  console.log(data, error);
}

run();
