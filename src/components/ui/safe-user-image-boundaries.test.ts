import { resolve } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const USER_IMAGE_CONSUMERS = [
  'src/components/DocumentPreviewModal.tsx',
  'src/components/Sidebar.tsx',
  'src/features/auth/components/LoginBrandingProvider.tsx',
  'src/features/settings/components/tabs/GenelTab.tsx',
  'src/components/ui/ImagePreprocessModal.tsx',
  'src/features/z-reports/components/ZReportUploadPanel.tsx',
  'src/app/dashboard/hammaddeler/fis-yukle/page.tsx',
  'src/app/dashboard/raporlar/yatirim-fisi/page.tsx',
  'src/app/dashboard/islem-gecmisi/page.tsx',
] as const

describe('user-controlled image boundaries', () => {
  it.each(USER_IMAGE_CONSUMERS)('%s rejects direct next/image imports', async (filePath) => {
    const eslint = new ESLint({ cwd: resolve('.') })
    const [result] = await eslint.lintText("import Image from 'next/image'\nvoid Image\n", {
      filePath: resolve(filePath),
    })

    expect(result.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 })]),
    )
  })
})
