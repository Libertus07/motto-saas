import type { SupabaseClient } from '@supabase/supabase-js'

import { devError } from '@/lib/debug'

const SUPPLIER_DOCUMENT_ERROR_MESSAGE = 'Belge görüntülenemedi. Lütfen tekrar deneyin.'
const SUPPLIER_DOCUMENT_MISSING_MESSAGE = 'Bu işlem için ekli belge bulunamadı.'

type OpenSupplierDocumentInput = {
  batchId: string | null
  isRequestCurrent: () => boolean
  openDocument: (reference: string) => Promise<void>
  organizationId: string | null
  showAlert: (message: string, type: 'error') => Promise<void>
  supabase: SupabaseClient
}

export async function loadSupplierDocumentReference(
  supabase: SupabaseClient,
  organizationId: string,
  batchId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('stock_movements')
    .select('document_url')
    .eq('batch_id', batchId)
    .eq('organization_id', organizationId)
    .not('document_url', 'is', null)
    .limit(1)
    .maybeSingle()

  if (error) {
    devError('Tedarikçi belgesi sorgulanamadı.', error)
    throw new Error(SUPPLIER_DOCUMENT_ERROR_MESSAGE)
  }

  return data?.document_url ?? null
}

export async function openSupplierDocument({
  batchId,
  isRequestCurrent,
  openDocument,
  organizationId,
  showAlert,
  supabase,
}: OpenSupplierDocumentInput): Promise<void> {
  if (!isRequestCurrent()) return

  if (!batchId || !organizationId) {
    await showAlert(SUPPLIER_DOCUMENT_MISSING_MESSAGE, 'error')
    return
  }

  try {
    const reference = await loadSupplierDocumentReference(supabase, organizationId, batchId)
    if (!isRequestCurrent()) return

    if (!reference) {
      await showAlert(SUPPLIER_DOCUMENT_MISSING_MESSAGE, 'error')
      return
    }

    await openDocument(reference)
  } catch {
    if (!isRequestCurrent()) return
    await showAlert(SUPPLIER_DOCUMENT_ERROR_MESSAGE, 'error')
  }
}
