import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/dynamic', () => ({ default: () => () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/components/ui/SafeUserImage', () => ({ SafeUserImage: () => null }))
vi.mock('@/components/NotificationProvider', () => ({
  useNotification: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }),
}))
vi.mock('@/context/OrganizationContext', () => ({
  useOrganization: () => ({ activeOrg: { id: 'organization-1' } }),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({ from: vi.fn() }) }))
vi.mock('@/lib/debug', () => ({ devError: vi.fn() }))
vi.mock('@/lib/format', () => ({ formatCurrency: (value: number) => String(value) }))
vi.mock('@/lib/imagePreprocess', () => ({ dataUrlToFile: vi.fn() }))
vi.mock('@/features/documents', () => ({
  persistSupplierReceiptWrite: vi.fn(),
  validateOrganizationDocument: vi.fn(),
}))
vi.mock('@/features/materials/services/supplier-receipt-source-selection', () => ({
  createSupplierReceiptSourceSelection: () => ({ begin: vi.fn(), dispose: vi.fn(), stage: vi.fn() }),
}))
vi.mock('@/features/materials/services/supplier-spreadsheet-adapter', () => ({
  toSupplierReceiptAnalysisInput: vi.fn(),
}))
vi.mock('@/features/spreadsheets/spreadsheet-parse-coordinator', () => ({
  createSpreadsheetParseCoordinator: () => ({ cancel: vi.fn(), run: vi.fn() }),
}))

import FisYuklePage from './page'

describe('FisYuklePage', () => {
  it('connects keyboard focus on the transparent receipt input to its visible upload surface', () => {
    const markup = renderToStaticMarkup(<FisYuklePage />)
    const uploadSurface = markup.match(/<label[^>]*>[\s\S]*?<\/label>/)?.[0]

    expect(uploadSurface).toContain('type="file"')
    expect(uploadSurface).toContain('opacity-0')
    expect(uploadSurface).toContain('has-[:focus-visible]:outline')
    expect(uploadSurface).toContain('has-[:focus-visible]:outline-amber-400')
  })
})
