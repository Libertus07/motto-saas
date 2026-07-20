import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('account_movements')
    .select('*')
    .eq('source_type', 'investment')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log("Account Movements (Investment Type):");
  console.log(JSON.stringify(data, null, 2));
  if (error) console.error(error);
}

run();
