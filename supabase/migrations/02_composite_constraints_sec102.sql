-- ==============================================================================
-- SEC-102 (AŞAMA 4 & 7): BİLEŞİK (COMPOSITE) FOREIGN KEY & TENANT UNIQUE KISITLARI
-- ==============================================================================

-- 1. SETTINGS TABLOSU TENANT BAZLI UNIQUE KEY KISITI
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'public' AND table_name = 'settings' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE public.settings DROP CONSTRAINT IF EXISTS settings_pkey CASCADE;
    END IF;
END $$;

ALTER TABLE public.settings ADD CONSTRAINT settings_organization_id_key_pk PRIMARY KEY (organization_id, key);

-- 2. CASH_RECONCILIATIONS TABLOSU TENANT BAZLI UNIQUE KISITI
ALTER TABLE public.cash_reconciliations DROP CONSTRAINT IF EXISTS cash_reconciliations_date_key CASCADE;
ALTER TABLE public.cash_reconciliations ADD CONSTRAINT cash_reconciliations_org_date_unique UNIQUE (organization_id, date);

-- 3. PARENT TABLOLAR İÇİN BİLEŞİK (ORGANIZATION_ID, ID) UNIQUE KISITLARI
ALTER TABLE public.materials DROP CONSTRAINT IF EXISTS materials_org_id_unique CASCADE;
ALTER TABLE public.materials ADD CONSTRAINT materials_org_id_unique UNIQUE (organization_id, id);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_org_id_unique CASCADE;
ALTER TABLE public.products ADD CONSTRAINT products_org_id_unique UNIQUE (organization_id, id);

ALTER TABLE public.sub_recipes DROP CONSTRAINT IF EXISTS sub_recipes_org_id_unique CASCADE;
ALTER TABLE public.sub_recipes ADD CONSTRAINT sub_recipes_org_id_unique UNIQUE (organization_id, id);

ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_org_id_unique CASCADE;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_org_id_unique UNIQUE (organization_id, id);

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_org_id_unique CASCADE;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_org_id_unique UNIQUE (organization_id, id);

ALTER TABLE public.investments DROP CONSTRAINT IF EXISTS investments_org_id_unique CASCADE;
ALTER TABLE public.investments ADD CONSTRAINT investments_org_id_unique UNIQUE (organization_id, id);

-- 4. PARENT-CHILD BİLEŞİK (COMPOSITE) FOREIGN KEY KISITLARI

-- Stock Movements -> Materials
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_material_tenant_fk CASCADE;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_material_tenant_fk
    FOREIGN KEY (organization_id, material_id) REFERENCES public.materials (organization_id, id) ON DELETE CASCADE;

-- Product Ingredients -> Products
ALTER TABLE public.product_ingredients DROP CONSTRAINT IF EXISTS product_ingredients_product_tenant_fk CASCADE;
ALTER TABLE public.product_ingredients ADD CONSTRAINT product_ingredients_product_tenant_fk
    FOREIGN KEY (organization_id, product_id) REFERENCES public.products (organization_id, id) ON DELETE CASCADE;

-- Sub Recipe Ingredients -> Sub Recipes
ALTER TABLE public.sub_recipe_ingredients DROP CONSTRAINT IF EXISTS sub_recipe_ingredients_recipe_tenant_fk CASCADE;
ALTER TABLE public.sub_recipe_ingredients ADD CONSTRAINT sub_recipe_ingredients_recipe_tenant_fk
    FOREIGN KEY (organization_id, sub_recipe_id) REFERENCES public.sub_recipes (organization_id, id) ON DELETE CASCADE;

-- Supplier Transactions -> Suppliers
ALTER TABLE public.supplier_transactions DROP CONSTRAINT IF EXISTS supplier_transactions_supplier_tenant_fk CASCADE;
ALTER TABLE public.supplier_transactions ADD CONSTRAINT supplier_transactions_supplier_tenant_fk
    FOREIGN KEY (organization_id, supplier_id) REFERENCES public.suppliers (organization_id, id) ON DELETE CASCADE;

-- Account Movements -> Accounts
ALTER TABLE public.account_movements DROP CONSTRAINT IF EXISTS account_movements_account_tenant_fk CASCADE;
ALTER TABLE public.account_movements ADD CONSTRAINT account_movements_account_tenant_fk
    FOREIGN KEY (organization_id, account_id) REFERENCES public.accounts (organization_id, id) ON DELETE CASCADE;

-- Investment Transactions -> Investments
ALTER TABLE public.investment_transactions DROP CONSTRAINT IF EXISTS investment_transactions_investment_tenant_fk CASCADE;
ALTER TABLE public.investment_transactions ADD CONSTRAINT investment_transactions_investment_tenant_fk
    FOREIGN KEY (organization_id, investment_id) REFERENCES public.investments (organization_id, id) ON DELETE CASCADE;

-- Material Price History -> Materials
ALTER TABLE public.material_price_history DROP CONSTRAINT IF EXISTS material_price_history_material_tenant_fk CASCADE;
ALTER TABLE public.material_price_history ADD CONSTRAINT material_price_history_material_tenant_fk
    FOREIGN KEY (organization_id, material_id) REFERENCES public.materials (organization_id, id) ON DELETE CASCADE;
