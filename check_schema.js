require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function check() {
  const { data: mats, error: err1 } = await supabase.from('materials').select('*').limit(1);
  const { data: prods, error: err2 } = await supabase.from('products').select('*').limit(1);
  const { data: exps, error: err3 } = await supabase.from('expenses').select('*').limit(1);
  const { data: ings, error: err4 } = await supabase.from('ingredients').select('*').limit(1);
  
  console.log('Materials:', err1 ? err1.message : Object.keys(mats[0] || {}));
  console.log('Products:', err2 ? err2.message : Object.keys(prods[0] || {}));
  console.log('Expenses:', err3 ? err3.message : Object.keys(exps[0] || {}));
  console.log('Ingredients:', err4 ? err4.message : Object.keys(ings[0] || {}));
}

check();
