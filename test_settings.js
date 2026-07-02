const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.log("Testing insert...");
  const { data, error } = await supabase.from('settings').upsert({ key: 'whatsapp_number', value: '+905554443322' }, { onConflict: 'key' });
  console.log("Error:", error);
  console.log("Data:", data);
}

test();
