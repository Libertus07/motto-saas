import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  closeDocument: vi.fn(),
  openDocument: vi.fn().mockResolvedValue(undefined),
  useDocumentPreview: vi.fn(),
  useInvestmentDocuments: vi.fn(),
  useInvestmentsData: vi.fn(),
  useInvestmentsUI: vi.fn(),
}))

vi.mock('react', () => ({
  useCallback: <T>(callback: T) => callback,
  useEffect: vi.fn(),
  useMemo: <T>(factory: () => T) => factory(),
}))
vi.mock('@/components/NotificationProvider', () => ({ useNotification: () => ({ showAlert: vi.fn() }) }))
vi.mock('@/features/documents', () => ({ useDocumentPreview: mocks.useDocumentPreview }))
vi.mock('@/hooks/useAppTour', () => ({ useAppTour: vi.fn() }))
vi.mock('../utils', () => ({
  buildInvestmentPortfolio: () => ({
    groups: {},
    profitPercentage: 0,
    totalCostValue: 0,
    totalCurrentValue: 0,
    totalProfit: 0,
    totalRentIncome: 0,
  }),
}))
vi.mock('./useInvestmentDocuments', () => ({ useInvestmentDocuments: mocks.useInvestmentDocuments }))
vi.mock('./useInvestmentsData', () => ({ useInvestmentsData: mocks.useInvestmentsData }))
vi.mock('./useInvestmentsUI', () => ({ useInvestmentsUI: mocks.useInvestmentsUI }))

import { useInvestmentWorkspace } from './useInvestmentWorkspace'

describe('investment document preview boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useDocumentPreview.mockReturnValue({
      closeDocument: mocks.closeDocument,
      openDocument: mocks.openDocument,
      previewLoading: true,
      previewReference: 'storage://motto_assets/org-1/investment-document/document.pdf',
      previewUrl: 'https://signed.example/investment.pdf',
    })
    mocks.useInvestmentsData.mockReturnValue({
      accounts: [],
      activeOrganizationId: 'org-1',
      investments: [],
      loading: false,
      rates: null,
      saving: false,
      transactions: [],
    })
    mocks.useInvestmentsUI.mockReturnValue({
      buyForm: { asset_type: 'gold' },
      expandedInvestment: null,
      groupBy: 'type',
      isBuyModalOpen: false,
      isEditModalOpen: false,
      isNoteModalOpen: false,
      isRentModalOpen: false,
      isValueModalOpen: false,
      notePreviewText: '',
      selectedInvestment: null,
      setBuyForm: vi.fn(),
      sortBy: 'date',
      sortOrder: 'desc',
    })
    mocks.useInvestmentDocuments.mockReturnValue({
      analyzeReceipt: vi.fn(),
      isAnalyzing: false,
      uploadDocument: vi.fn(),
    })
  })

  it('passes only a stable reference into the authorization hook and exposes its resolved modal state', async () => {
    const workspace = useInvestmentWorkspace()

    await workspace.list.onDoc('storage://motto_assets/org-1/investment-document/document.pdf')

    expect(mocks.openDocument).toHaveBeenCalledWith('storage://motto_assets/org-1/investment-document/document.pdf')
    expect(workspace.list.documentPreviewLoadingReference).toBe(
      'storage://motto_assets/org-1/investment-document/document.pdf',
    )
    expect(workspace.modals.documentPreview).toEqual({
      isOpen: true,
      onClose: mocks.closeDocument,
      url: 'https://signed.example/investment.pdf',
    })
  })
})
