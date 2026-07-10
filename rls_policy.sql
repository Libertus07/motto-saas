-- 1) RLS'i etkinleştir
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_calculations ENABLE ROW LEVEL SECURITY;

-- 2) Eski "herkese açık" politikaları kaldır
DROP POLICY IF EXISTS "Public investments access" ON investments;
DROP POLICY IF EXISTS "Public investment_transactions access" ON investment_transactions;

-- 3) Sadece oturum açmış kullanıcılara izin veren tek tip politika
DROP POLICY IF EXISTS "authenticated_only" ON investments;
CREATE POLICY "authenticated_only" ON investments FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON investment_transactions;
CREATE POLICY "authenticated_only" ON investment_transactions FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON settings;
CREATE POLICY "authenticated_only" ON settings FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON cash_reconciliations;
CREATE POLICY "authenticated_only" ON cash_reconciliations FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON materials;
CREATE POLICY "authenticated_only" ON materials FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON products;
CREATE POLICY "authenticated_only" ON products FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON sub_recipes;
CREATE POLICY "authenticated_only" ON sub_recipes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON sub_recipe_ingredients;
CREATE POLICY "authenticated_only" ON sub_recipe_ingredients FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON product_ingredients;
CREATE POLICY "authenticated_only" ON product_ingredients FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON suppliers;
CREATE POLICY "authenticated_only" ON suppliers FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON supplier_transactions;
CREATE POLICY "authenticated_only" ON supplier_transactions FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON expenses;
CREATE POLICY "authenticated_only" ON expenses FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON sales;
CREATE POLICY "authenticated_only" ON sales FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON stock_movements;
CREATE POLICY "authenticated_only" ON stock_movements FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON accounts;
CREATE POLICY "authenticated_only" ON accounts FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON account_movements;
CREATE POLICY "authenticated_only" ON account_movements FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON material_price_history;
CREATE POLICY "authenticated_only" ON material_price_history FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON activity_logs;
CREATE POLICY "authenticated_only" ON activity_logs FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON ingredients;
CREATE POLICY "authenticated_only" ON ingredients FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON recipes;
CREATE POLICY "authenticated_only" ON recipes FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated_only" ON price_calculations;
CREATE POLICY "authenticated_only" ON price_calculations FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
