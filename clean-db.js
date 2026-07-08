require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function cleanDB() {
    console.log("Cleaning large document_urls from sales table...");
    // Nullify all document_url to recover the database!
    const { data, error } = await supabase.from('sales').update({ document_url: null }).neq('document_url', null);
    console.log("Result:", error ? error : "Cleaned DB successfully!");
}

cleanDB();
