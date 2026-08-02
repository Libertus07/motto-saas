import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('RPC Fonksiyon İletişim ve İmza Doğrulama Testleri', () => {
  it('20260728000004_tenant_rpc_functions_sec102.sql içerisinde eski overload DROP komutları bulunmalıdır', () => {
    const migrationFilePath = path.join(
      process.cwd(),
      'supabase/migrations/20260728000004_tenant_rpc_functions_sec102.sql',
    )
    expect(fs.existsSync(migrationFilePath)).toBe(true)

    const sqlContent = fs.readFileSync(migrationFilePath, 'utf8')
    expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.delete_receipt_transaction(uuid);')
    expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.delete_z_report_transaction(uuid);')
    expect(sqlContent).toContain('DROP FUNCTION IF EXISTS public.delete_supplier_transaction(uuid);')
  })

  it('RPC parametre isimleri frontend API rotaları ile uyumlu olmalıdır', () => {
    const deleteReceiptRoute = path.join(process.cwd(), 'src/app/api/delete-receipt/route.ts')
    const deleteZReportRoute = path.join(process.cwd(), 'src/app/api/delete-z-report/route.ts')
    const tedarikcilerPage = path.join(process.cwd(), 'src/app/dashboard/tedarikciler/page.tsx')

    const receiptContent = fs.readFileSync(deleteReceiptRoute, 'utf8')
    expect(receiptContent).toContain('p_batch_id: batch_id')

    const zReportContent = fs.readFileSync(deleteZReportRoute, 'utf8')
    expect(zReportContent).toContain('p_batch_id: batch_id')

    const tedarikcilerContent = fs.readFileSync(tedarikcilerPage, 'utf8')
    expect(tedarikcilerContent).toContain('p_transaction_id: trx.id')
  })

  it('kira tahsilatı tenant-scoped RPC imzasını kullanmalıdır', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20260801211530_fix_rpc_lint_and_rent_signature.sql',
    )
    const investmentHookPath = path.join(process.cwd(), 'src/features/investments/hooks/useInvestmentsData.ts')
    const migration = fs.readFileSync(migrationPath, 'utf8')
    const investmentHook = fs.readFileSync(investmentHookPath, 'utf8')

    expect(migration).toContain('p_organization_id uuid')
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.process_investment_rent(uuid, uuid, numeric);')
    expect(investmentHook).toContain('p_organization_id: activeOrg?.id')
  })
})
