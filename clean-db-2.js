require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function cleanDB() {
    console.log("Fetching IDs to clean...");
    const { data, error } = await supabase.from('sales').select('id').neq('document_url', null);
    if (error) {
        console.error("Fetch error:", error);
        return;
    }
    console.log(`Found ${data.length} rows to clean. Processing one by one...`);
    for (const row of data) {
        const { error: updErr } = await supabase.from('sales').update({ document_url: null }).eq('id', row.id);
        if (updErr) {
            console.error(`Error updating id ${row.id}:`, updErr);
        } else {
            console.log(`Cleaned id ${row.id}`);
        }
    }
    console.log("Done.");
}

cleanDB();
