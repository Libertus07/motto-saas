const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data: sales, error: salesErr } = await supabase.from('sales').select('*');
  console.log('Sales count:', sales ? sales.length : 0);
  if (sales && sales.length > 0) {
      console.log('Last sale date:', sales[0].sale_date);
  }
  const { data: zr } = await supabase.from('z_reports').select('*');
  console.log('ZReports count:', zr ? zr.length : 0);
}
run();
