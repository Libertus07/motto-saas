import { describe, expect, it } from 'vitest'

import {
  createFinancialDocumentUploadInput,
  scopeSupplierReceiptPayload,
  withInvestmentReplacement,
} from './financial-document-write-contracts'

const organizationId = '11111111-1111-4111-8111-111111111111'
const file = new File(['pdf'], 'receipt.pdf', { type: 'application/pdf' })

describe('financial document write contracts', () => {
  it.each([
    ['supplier-receipt', 'motto_assets', 'supplier-receipt'],
    ['investment-receipt', 'motto_assets', 'investment-receipt'],
    ['z-report', 'receipts', 'z-report'],
  ] as const)('maps %s to its controlled bucket and kind', (flow, bucket, kind) => {
    expect(createFinancialDocumentUploadInput(flow, organizationId, file)).toEqual({
      organizationId,
      bucket,
      kind,
      file,
    })
  })

  it('returns no upload input when the flow has no selected file', () => {
    expect(createFinancialDocumentUploadInput('z-report', organizationId, null)).toBeNull()
  })

  it('adds explicit tenant, replacement and stable reference metadata to supplier payloads', () => {
    expect(
      scopeSupplierReceiptPayload(
        { batch_id: 'batch-1', items: [] },
        organizationId,
        'old-batch',
        'storage://motto_assets/path.pdf',
      ),
    ).toEqual({
      batch_id: 'batch-1',
      items: [],
      organization_id: organizationId,
      replace_batch_id: 'old-batch',
      image_url: 'storage://motto_assets/path.pdf',
    })
  })

  it('adds investment replacement metadata without changing existing RPC arguments', () => {
    expect(
      withInvestmentReplacement({ p_organization_id: organizationId, p_name: 'Altın' }, 'old-transaction'),
    ).toEqual({
      p_organization_id: organizationId,
      p_name: 'Altın',
      p_replace_transaction_id: 'old-transaction',
    })
  })
})
