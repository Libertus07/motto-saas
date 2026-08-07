import type { SupabaseClient } from '@supabase/supabase-js'

import { persistWithOrganizationDocument } from './document-storage-service'
import {
  createFinancialDocumentUploadInput,
  scopeSupplierReceiptPayload,
  withInvestmentReplacement,
} from './financial-document-write-contracts'

export async function persistSupplierReceiptWrite<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  organizationId: string,
  file: File | null,
  replaceBatchId: string | null,
  payload: T,
): Promise<unknown> {
  return persistWithOrganizationDocument(
    supabase,
    createFinancialDocumentUploadInput('supplier-receipt', organizationId, file),
    null,
    async (documentReference) => {
      const { data, error } = await supabase.rpc('process_receipt_upload', {
        payload: scopeSupplierReceiptPayload(payload, organizationId, replaceBatchId, documentReference),
      })
      if (error) throw new Error('Fiş kaydedilemedi. Lütfen tekrar deneyin.')
      return data
    },
  )
}

export async function persistInvestmentReceiptWrite<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  organizationId: string,
  file: File | null,
  replaceTransactionId: string | null,
  rpcArguments: T,
): Promise<unknown> {
  return persistWithOrganizationDocument(
    supabase,
    createFinancialDocumentUploadInput('investment-receipt', organizationId, file),
    null,
    async (documentReference) => {
      const { data, error } = await supabase.rpc(
        'buy_investment_transaction',
        withInvestmentReplacement({ ...rpcArguments, p_document_url: documentReference }, replaceTransactionId),
      )
      if (error) throw new Error('Yatırım fişi kaydedilemedi. Lütfen tekrar deneyin.')
      return data
    },
  )
}

export async function persistZReportWrite<T>(
  supabase: SupabaseClient,
  organizationId: string,
  file: File | null,
  persist: (documentReference: string | null) => Promise<T>,
): Promise<T> {
  return persistWithOrganizationDocument(
    supabase,
    createFinancialDocumentUploadInput('z-report', organizationId, file),
    null,
    persist,
  )
}
