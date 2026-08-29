import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/components/ui/SafeUserImage', () => ({ SafeUserImage: () => null }))

import { ZReportUploadPanel, type ZReportUploadWorkspace } from './ZReportUploadPanel'

describe('ZReportUploadPanel', () => {
  it('connects keyboard focus on the transparent file input to the visible upload surface', () => {
    const workspace: ZReportUploadWorkspace = {
      imageUrl: null,
      fileText: null,
      fileType: null,
      loading: false,
      analyzing: false,
      handleFileUpload: vi.fn(),
      analyze: vi.fn(),
      startManualMode: vi.fn(),
    }

    const markup = renderToStaticMarkup(<ZReportUploadPanel workspace={workspace} />)
    const uploadSurface = markup.match(/<label[^>]*>[\s\S]*?<\/label>/)?.[0]

    expect(uploadSurface).toContain('type="file"')
    expect(uploadSurface).toContain('opacity-0')
    expect(uploadSurface).toContain('has-[:focus-visible]:outline')
    expect(uploadSurface).toContain('has-[:focus-visible]:outline-amber-400')
  })
})
