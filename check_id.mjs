import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: tx } = await supabase
    .from('investment_transactions')
    .select('*')
    .eq('id', '799a1ab1-dc22-4412-967b-b281a24da03e');

  const { data: inv } = await supabase
    .from('investments')
    .select('*')
    .eq('id', tx[0]?.investment_id);

  console.log("Investment Transaction:", JSON.stringify(tx, null, 2));
  console.log("Investment:", JSON.stringify(inv, null, 2));
}

run();
