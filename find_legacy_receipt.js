require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function dryRun() {
    console.log("Eski fiş stok kayıtları aranıyor (Sistemden Fiş Yükleme)...");
    const { data: movements, error: movErr } = await supabase
        .from('stock_movements')
        .select('id, created_at, quantity, unit_price, material_id, note, batch_id')
        .is('batch_id', null);
        
    if (movErr) {
        console.error("Hata:", movErr);
        return;
    }
    const filteredMovements = movements.filter(m => m.note && m.note.includes('Sistemden'));
    console.log(`Bulunan stok kayıtları:`, filteredMovements.length);
    console.log(filteredMovements);

    console.log("\nEski cari işlemler aranıyor (Sistemden Fiş Yükleme)...");
    const { data: transactions, error: trxErr } = await supabase
        .from('supplier_transactions')
        .select('id, created_at, transaction_date, amount, transaction_type, note, batch_id')
        .is('batch_id', null)
        .eq('transaction_type', 'invoice');
        
    if (trxErr) {
        console.error("Hata:", trxErr);
        return;
    }
    const filteredTrx = transactions.filter(t => t.note && t.note.includes('Sistemden'));
    console.log(`Bulunan cari işlemler:`, filteredTrx.length);
    console.log(filteredTrx);
}

dryRun();
