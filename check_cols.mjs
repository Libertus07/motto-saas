import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: cols } = await supabase.rpc('get_table_columns', { table_name: 'account_movements' });
  const { data: rows } = await supabase.from('account_movements').select('*').limit(1);
  if (rows && rows.length > 0) {
    console.log(Object.keys(rows[0]));
  }
}

run();
