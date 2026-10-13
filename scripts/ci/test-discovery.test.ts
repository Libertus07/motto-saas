import { spawnSync } from 'node:child_process'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('application test discovery boundary', () => {
  it('collects application and CI contracts without collecting independently tested infrastructure', () => {
    // Use the installed runner's real discovery, without executing tests recursively.
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import { createVitest } from 'vitest/node';
          import path from 'node:path';
          const ctx = await createVitest('test', { watch: false }, {
            envFile: false,
            server: { watch: null },
          });
          try {
            const files = await ctx.globTestFiles();
            console.log('DISCOVERED_TESTS=' + JSON.stringify(files.map(([, file]) =>
              path.relative(process.cwd(), file).split(path.sep).join('/')
            )));
          } finally {
            await ctx.close();
          }
        `,
      ],
      { cwd: path.resolve('.'), encoding: 'utf8', timeout: 30_000, windowsHide: true },
    )

    expect(result.error).toBeUndefined()
    expect(result.status, result.stderr).toBe(0)
    const output = result.stdout.split(/\r?\n/).find((line) => line.startsWith('DISCOVERED_TESTS='))
    expect(output, result.stdout).toBeDefined()
    const files = JSON.parse(output!.slice('DISCOVERED_TESTS='.length)) as string[]

    expect(files).toContain('src/components/DocumentPreviewModal.test.tsx')
    expect(files).toContain('scripts/ci/validate-ops02-infrastructure-workflow.test.ts')
    expect(files).toContain('scripts/ci/test-discovery.test.ts')
    expect(files.filter((file) => file.startsWith('infra/'))).toEqual([])
  }, 35_000)
})
