import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedZReport } from '../types'
import { prepareZReportForSave } from '../z-report-utils'

export async function findExistingZReportBatch(supabase: SupabaseClient, organizationId: string, reportDate: string) {
  const { data, error } = await supabase
    .from('sales')
    .select('batch_id')
    .eq('sale_date', reportDate)
    .eq('organization_id', organizationId)
    .not('batch_id', 'is', null)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.batch_id as string | undefined
}

export async function processZReport(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    report: ParsedZReport
    documentUrl: string | null
    replaceExisting: boolean
  },
) {
  const prepared = prepareZReportForSave(input.report)
  const { data, error } = await supabase.rpc('process_z_report_atomic', {
    p_organization_id: input.organizationId,
    p_report_date: input.report.date,
    p_sales: prepared.sales,
    p_expenses: prepared.expenses,
    p_payment_methods: input.report.payment_methods ?? {},
    p_document_url: input.documentUrl,
    p_replace_existing: input.replaceExisting,
    p_audit_details: { source: 'z_report_workspace' },
  })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string') throw new Error('Z-Raporu işlendi ancak işlem kimliği alınamadı.')
  return data
}
