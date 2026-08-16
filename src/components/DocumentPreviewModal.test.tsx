import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DocumentPreviewModal } from './DocumentPreviewModal'

describe('DocumentPreviewModal', () => {
  it('gives the initial desktop image preview a real width and keeps the whole document visible', () => {
    const markup = renderToStaticMarkup(
      <DocumentPreviewModal
        isOpen
        onClose={vi.fn()}
        url="https://example.com/document.jpg?token=test"
        title="Test Belgesi"
      />,
    )

    expect(markup).not.toContain('sm:w-auto')
    expect(markup).toContain('w-full sm:max-w-2xl h-[78vh]')
    expect(markup).not.toContain('sm:object-cover')
    expect(markup).toContain('object-contain')
  })

  it('keeps the PDF preview and document actions available', () => {
    const markup = renderToStaticMarkup(
      <DocumentPreviewModal isOpen onClose={vi.fn()} url="data:application/pdf;base64,AA==" title="Test Belgesi" />,
    )

    expect(markup).toContain('title="PDF Önizleme"')
    expect(markup).toContain('Sekmede Aç')
    expect(markup).toContain('İndir')
    expect(markup).not.toContain('target="_blank"')
  })

  it('uses a browser-native secure link for a signed web document', () => {
    const markup = renderToStaticMarkup(
      <DocumentPreviewModal
        isOpen
        onClose={vi.fn()}
        url="https://example.com/document.jpg?token=test"
        title="Test Belgesi"
      />,
    )

    expect(markup).toMatch(
      /<a[^>]*href="https:\/\/example\.com\/document\.jpg\?token=test"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*>[\s\S]*?Sekmede Aç[\s\S]*?<\/a>/,
    )
  })

  it('uses only browser-native secure links for an unsupported signed preview format', () => {
    const markup = renderToStaticMarkup(
      <DocumentPreviewModal
        isOpen
        onClose={vi.fn()}
        url="https://example.com/document.xml?token=test"
        title="Test Belgesi"
      />,
    )

    expect(markup).not.toMatch(/<button[^>]*>↗️ Sekmede Aç<\/button>/)
    expect(markup.match(/target="_blank"/g)).toHaveLength(2)
  })

  it('does not expose an executable link for an unexpected URL scheme', () => {
    const markup = renderToStaticMarkup(
      <DocumentPreviewModal isOpen onClose={vi.fn()} url="javascript:alert(1)" title="Test Belgesi" />,
    )

    expect(markup).not.toContain('href="javascript:')
    expect(markup).not.toContain('target="_blank"')
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>📥 Cihaza İndir<\/button>/)
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*title="Belgeyi Cihaza İndir"[^>]*>/)
  })
})
