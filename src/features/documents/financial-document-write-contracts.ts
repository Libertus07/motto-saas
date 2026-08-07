import type { UploadOrganizationDocumentInput } from './document-reference'

export type FinancialDocumentFlow = 'supplier-receipt' | 'investment-receipt' | 'z-report'

const flowStorage = {
  'supplier-receipt': { bucket: 'motto_assets', kind: 'supplier-receipt' },
  'investment-receipt': { bucket: 'motto_assets', kind: 'investment-receipt' },
  'z-report': { bucket: 'receipts', kind: 'z-report' },
} as const

export function createFinancialDocumentUploadInput(
  flow: FinancialDocumentFlow,
  organizationId: string,
  file: File | null,
): UploadOrganizationDocumentInput | null {
  if (!file) return null
  return { organizationId, ...flowStorage[flow], file }
}

export function scopeSupplierReceiptPayload<T extends Record<string, unknown>>(
  payload: T,
  organizationId: string,
  replaceBatchId: string | null,
  documentReference: string | null,
): T & {
  organization_id: string
  replace_batch_id: string | null
  image_url: string | null
} {
  return {
    ...payload,
    organization_id: organizationId,
    replace_batch_id: replaceBatchId,
    image_url: documentReference,
  }
}

export function withInvestmentReplacement<T extends Record<string, unknown>>(
  rpcArguments: T,
  replaceTransactionId: string | null,
): T & { p_replace_transaction_id: string | null } {
  return { ...rpcArguments, p_replace_transaction_id: replaceTransactionId }
}
