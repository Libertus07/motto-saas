import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = path.resolve('scripts/roadmap/validate-roadmap.mjs')
const temporaryRoots: string[] = []

type RowOverrides = {
  id?: string
  workstream?: string
  outcome?: string
  status?: string
  nextGate?: string
  detail?: string
  evidence?: string
}

function row(overrides: RowOverrides = {}) {
  const values = {
    id: 'ROADMAP-01',
    workstream: 'Merkezi yol haritasÄ±',
    outcome: 'GÃ¶rev durumu tek kaynaktan izlenir.',
    status: 'Devam ediyor',
    nextGate: 'Yerel kalite kapÄ±larÄ±nÄ± tamamla.',
    detail: 'specs/example.md',
    evidence: 'TasarÄ±m onayÄ± kaydedildi.',
    ...overrides,
  }

  return `| \`${values.id}\` | **${values.workstream}**<br>SonuÃ§: ${values.outcome} | ${values.status} | Sonraki: ${values.nextGate}<br>Detay: [AyrÄ±ntÄ±](${values.detail})<br>KanÄ±t: ${values.evidence} |`
}

function createFixture(rows: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'motto-roadmap-'))
  temporaryRoots.push(root)
  fs.mkdirSync(path.join(root, 'docs/superpowers/specs'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/superpowers/specs/example.md'), '# Example\n')
  fs.writeFileSync(
    path.join(root, 'docs/superpowers/ROADMAP.md'),
    [
      '# Roadmap',
      '',
      '| ID | GÃ¶rev ve sonuÃ§ | Durum | Teslimat bilgisi |',
      '| --- | --- | --- | --- |',
      ...rows,
    ].join('\n'),
  )
  return root
}

function runValidator(root: string, roadmap = 'docs/superpowers/ROADMAP.md') {
  return spawnSync(process.execPath, [scriptPath, '--root', root, '--roadmap', roadmap], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('roadmap validator', () => {
  it('accepts a valid repository-local roadmap', () => {
    const result = runValidator(createFixture([row()]))

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Roadmap validation passed (1 tasks).')
  })

  it.each([
    ['DUPLICATE_ID', [row(), row()]],
    ['INVALID_ID', [row({ id: 'roadmap-1' })]],
    ['INVALID_STATUS', [row({ status: 'Bitti' })]],
    ['MISSING_WORKSTREAM', [row({ workstream: ' ' })]],
    ['MISSING_OUTCOME', [row({ outcome: ' ' })]],
    ['MISSING_NEXT_GATE', [row({ nextGate: ' ' })]],
    ['MISSING_EVIDENCE', [row({ evidence: ' ' })]],
    ['MISSING_DETAIL_FILE', [row({ detail: 'specs/missing.md' })]],
    ['EXTERNAL_DETAIL_LINK', [row({ detail: 'https://example.com/plan.md' })]],
    ['MISSING_COMPLETION_EVIDENCE', [row({ status: 'TamamlandÄ±', evidence: 'â€”' })]],
    ['MULTIPLE_ACTIVE_TASKS', [row(), row({ id: 'SEC-02', workstream: 'GÃ¼venlik incelemesi' })]],
    ['DETAIL_OUTSIDE_REPOSITORY', [row({ detail: '../../../outside.md' })]],
  ])('rejects %s', (issueCode, rows) => {
    const result = runValidator(createFixture(rows))

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`[${issueCode}]`)
  })

  it('rejects a detail symlink that resolves outside the repository', () => {
    const root = createFixture([row({ detail: 'specs/outside-link.md' })])
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'motto-roadmap-outside-'))
    temporaryRoots.push(outsideRoot)
    fs.symlinkSync(outsideRoot, path.join(root, 'docs/superpowers/specs/outside-link.md'), 'junction')

    const result = runValidator(root)

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[DETAIL_OUTSIDE_REPOSITORY]')
  })
})
