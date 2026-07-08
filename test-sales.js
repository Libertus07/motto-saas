require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    const { data, error } = await supabase.from('sales').select('id,sale_date,quantity,total_price,batch_id,product_id,document_url').order('sale_date', { ascending: false });
    console.log("Error:", JSON.stringify(error, null, 2));
}

test();
