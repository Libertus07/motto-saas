import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { EditInvestmentModal } from './EditInvestmentModal'
import type { EditFormState } from '../types'
import type { Investment } from '@/types/database'

describe('EditInvestmentModal document input', () => {
  it('offers only document formats accepted by the shared investment contract', () => {
    const investment: Investment = {
      id: 'investment-1',
      asset_type: 'gold',
      name: 'Gram Altın',
      quantity: 1,
      average_cost: 5000,
    }
    const form: EditFormState = {
      name: investment.name,
      quantity: '1',
      average_cost: '5000',
      notes: '',
      purchase_date: '2026-08-08',
      document_url: '',
      document_file: null,
    }

    const markup = renderToStaticMarkup(
      <EditInvestmentModal
        isOpen
        onClose={vi.fn()}
        investment={investment}
        form={form}
        setForm={vi.fn()}
        onSubmit={vi.fn()}
        saving={false}
        onFileUpload={vi.fn()}
      />,
    )

    expect(markup).toContain('accept="image/jpeg,image/png,image/webp,application/pdf"')
    expect(markup).not.toContain('spreadsheetml')
  })
})
