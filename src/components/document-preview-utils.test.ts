import { afterEach, describe, expect, it, vi } from 'vitest'

import { openDocumentInNewTab } from './document-preview-utils'

describe('openDocumentInNewTab', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reserves the new tab before decoding a legacy data document', () => {
    const events: string[] = []
    const replace = vi.fn(() => events.push('navigate'))
    const popup = {
      close: vi.fn(),
      document: { write: vi.fn() },
      location: { replace },
      opener: {} as Window | null,
    }
    const open = vi.fn(() => {
      events.push('open')
      return popup
    })

    vi.stubGlobal('window', { open })
    vi.stubGlobal(
      'atob',
      vi.fn(() => {
        events.push('decode')
        return '\0'
      }),
    )
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      events.push('create-object-url')
      return 'blob:test-document'
    })

    openDocumentInNewTab('data:application/pdf;base64,AA==')

    expect(events[0]).toBe('open')
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(popup.opener).toBeNull()
    expect(replace).toHaveBeenCalledWith('blob:test-document')
  })

  it('navigates a reserved tab to a trusted web document', () => {
    const replace = vi.fn()
    const popup = {
      close: vi.fn(),
      location: { replace },
      opener: {} as Window | null,
    }
    const open = vi.fn(() => popup)
    vi.stubGlobal('window', { open })

    const opened = openDocumentInNewTab('https://example.com/document.pdf')

    expect(opened).toBe(true)
    expect(open).toHaveBeenCalledWith('about:blank', '_blank')
    expect(popup.opener).toBeNull()
    expect(replace).toHaveBeenCalledWith('https://example.com/document.pdf')
  })

  it('reports when the browser blocks the new tab', () => {
    const open = vi.fn(() => null)
    vi.stubGlobal('window', { open })

    expect(openDocumentInNewTab('https://example.com/document.pdf')).toBe(false)
  })

  it('closes the reserved tab when a legacy data document cannot be decoded', () => {
    const close = vi.fn()
    const popup = {
      close,
      location: { replace: vi.fn() },
      opener: {} as Window | null,
    }
    vi.stubGlobal('window', { open: vi.fn(() => popup) })
    vi.stubGlobal(
      'atob',
      vi.fn(() => {
        throw new Error('invalid base64')
      }),
    )

    expect(openDocumentInNewTab('data:application/pdf;base64,%%%')).toBe(false)
    expect(close).toHaveBeenCalledOnce()
  })
})
