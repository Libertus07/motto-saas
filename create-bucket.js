require('dotenv').config({path: '.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function createBucket() {
    console.log("Checking storage buckets...");
    const { data: buckets } = await supabase.storage.listBuckets();
    
    if (buckets && buckets.find(b => b.name === 'receipts')) {
        console.log("Bucket 'receipts' already exists.");
    } else {
        console.log("Creating 'receipts' bucket...");
        const { data, error } = await supabase.storage.createBucket('receipts', { public: true });
        if (error) {
            console.error("Error creating bucket:", error);
        } else {
            console.log("Bucket created successfully:", data);
        }
    }
}

createBucket();
