import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DocumentPreviewModal } from './DocumentPreviewModal'

describe('DocumentPreviewModal', () => {
  it('keeps the PDF preview and document actions available', () => {
    const markup = renderToStaticMarkup(
      <DocumentPreviewModal isOpen onClose={vi.fn()} url="data:application/pdf;base64,AA==" title="Test Belgesi" />,
    )

    expect(markup).toContain('title="PDF Önizleme"')
    expect(markup).toContain('Sekmede Aç')
    expect(markup).toContain('İndir')
  })
})
