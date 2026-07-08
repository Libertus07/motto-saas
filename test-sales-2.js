require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
    console.log("Fetching 1 sale without order...");
    const { data, error } = await supabase.from('sales').select('id,sale_date').limit(1);
    console.log("Error:", error ? error : "Success, data length: " + data.length);
}

test();
