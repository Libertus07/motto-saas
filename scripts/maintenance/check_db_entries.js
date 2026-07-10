require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log("Stok hareketleri:");
    const { data: m } = await supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(5);
    console.log(m);

    console.log("\nCari işlemler:");
    const { data: t } = await supabase.from('supplier_transactions').select('*').order('created_at', { ascending: false }).limit(5);
    console.log(t);
}
check();
