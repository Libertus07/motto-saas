import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: inv } = await supabase.rpc('get_table_columns', { table_name: 'account_movements' });
  const { data, error } = await supabase.from('account_movements').delete().eq('id', 'b1abdd0b-654e-4471-95c8-f6ff79cde2f4').select();
  console.log('Delete result:', data, error);
}

run();
