import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: movs } = await supabase.from('account_movements').select('*').eq('source_type', 'investment');

  for (const mov of movs) {
    const { data: tx } = await supabase.from('investment_transactions').select('id').eq('id', mov.source_id).maybeSingle();

    if (!tx) {
      console.log('Found orphaned movement:', mov.id);
      const { error } = await supabase.from('account_movements').delete().eq('id', mov.id);
      if (error) {
        console.error('Failed to delete:', error);
      } else {
        console.log('Deleted orphaned movement:', mov.id);
      }
    }
  }
}

run();
