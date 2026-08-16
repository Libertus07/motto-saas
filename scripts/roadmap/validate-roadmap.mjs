import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const ALLOWED_STATUSES = new Set([
  'TamamlandÄ±',
  'Yerelde tamam',
  'Devam ediyor',
  'HazÄ±r',
  'Bekliyor',
  'Engelli',
  'Ertelendi',
])
const COMPLETION_STATUSES = new Set(['TamamlandÄ±', 'Yerelde tamam'])
const TASK_ID_PATTERN = /^[A-Z][A-Z0-9]*-\d{2}$/
const WORKSTREAM_PATTERN = /^\*\*(?<workstream>.+)\*\*<br>SonuÃ§:\s*(?<outcome>.*)$/u
const DELIVERY_PATTERN =
  /^Sonraki:\s*(?<nextGate>.*?)<br>Detay:\s*\[[^\]]+\]\((?<detail>[^)]+)\)<br>KanÄ±t:\s*(?<evidence>.*)$/u

function issue(code, message, line) {
  return { code, message, line }
}

function isInsideRepository(repositoryRoot, candidate) {
  const relative = path.relative(repositoryRoot, candidate)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function parseTaskRows(markdown) {
  return markdown
    .split(/\r?\n/u)
    .map((source, index) => ({ source, line: index + 1 }))
    .filter(({ source }) => /^\|\s*`[^`]+`\s*\|/u.test(source))
    .map(({ source, line }) => ({
      line,
      cells: source
        .trim()
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    }))
}

function hasLabel(cell, label) {
  return new RegExp(`<br>${label}:`, 'u').test(cell)
}

function validateRoadmap({ repositoryRoot, roadmapPath }) {
  const entries = []
  const issues = []
  let markdown

  try {
    markdown = fs.readFileSync(roadmapPath, 'utf8')
  } catch {
    return { entries, issues: [issue('ROADMAP_UNREADABLE', `Roadmap okunamadÄ±: ${roadmapPath}`, 0)] }
  }

  const rows = parseTaskRows(markdown)
  if (rows.length === 0) issues.push(issue('NO_TASKS', 'Roadmap iÃ§inde gÃ¶rev satÄ±rÄ± bulunamadÄ±.', 0))

  for (const row of rows) {
    if (row.cells.length !== 4) {
      issues.push(issue('WRONG_COLUMN_COUNT', 'GÃ¶rev satÄ±rÄ± tam olarak dÃ¶rt hÃ¼cre iÃ§ermelidir.', row.line))
      continue
    }

    const id = row.cells[0].replace(/^`|`$/gu, '')
    if (!TASK_ID_PATTERN.test(id)) issues.push(issue('INVALID_ID', `GeÃ§ersiz gÃ¶rev kimliÄŸi: ${id}`, row.line))

    const workstreamMatch = row.cells[1].match(WORKSTREAM_PATTERN)
    if (!workstreamMatch) {
      const workstream = row.cells[1].match(/^\*\*(.*?)\*\*/u)?.[1]?.trim()
      if (!workstream) issues.push(issue('MISSING_WORKSTREAM', 'Ã‡alÄ±ÅŸma alanÄ± zorunludur.', row.line))
      const outcome = row.cells[1].match(/SonuÃ§:\s*(.*)$/u)?.[1]?.trim()
      if (!outcome) issues.push(issue('MISSING_OUTCOME', 'SonuÃ§ zorunludur.', row.line))
      if (workstream && outcome)
        issues.push(issue('MALFORMED_WORKSTREAM_CELL', 'Ã‡alÄ±ÅŸma alanÄ± hÃ¼cresi biÃ§imi geÃ§ersizdir.', row.line))
    } else {
      if (!workstreamMatch.groups.workstream.trim())
        issues.push(issue('MISSING_WORKSTREAM', 'Ã‡alÄ±ÅŸma alanÄ± zorunludur.', row.line))
      if (!workstreamMatch.groups.outcome.trim()) issues.push(issue('MISSING_OUTCOME', 'SonuÃ§ zorunludur.', row.line))
    }

    const status = row.cells[2]
    if (!ALLOWED_STATUSES.has(status)) issues.push(issue('INVALID_STATUS', `GeÃ§ersiz durum: ${status}`, row.line))

    const deliveryMatch = row.cells[3].match(DELIVERY_PATTERN)
    if (!deliveryMatch) {
      if (!hasLabel(row.cells[3], 'Sonraki'))
        issues.push(issue('MISSING_NEXT_GATE', 'Sonraki kapÄ± zorunludur.', row.line))
      if (!hasLabel(row.cells[3], 'KanÄ±t')) issues.push(issue('MISSING_EVIDENCE', 'KanÄ±t zorunludur.', row.line))
      if (hasLabel(row.cells[3], 'Sonraki') && hasLabel(row.cells[3], 'KanÄ±t'))
        issues.push(issue('MALFORMED_DELIVERY_CELL', 'Teslimat bilgisi hÃ¼cresi biÃ§imi geÃ§ersizdir.', row.line))
      continue
    }

    const { nextGate, detail, evidence } = deliveryMatch.groups
    if (!nextGate.trim()) issues.push(issue('MISSING_NEXT_GATE', 'Sonraki kapÄ± zorunludur.', row.line))
    if (!evidence.trim()) issues.push(issue('MISSING_EVIDENCE', 'KanÄ±t zorunludur.', row.line))

    const externalTarget =
      /^[a-z][a-z\d+.-]*:/iu.test(detail) ||
      detail.startsWith('//') ||
      path.isAbsolute(detail) ||
      detail.startsWith('#') ||
      detail.startsWith('?')
    let detailPath
    if (externalTarget) {
      issues.push(
        issue('EXTERNAL_DETAIL_LINK', `AyrÄ±ntÄ± baÄŸlantÄ±sÄ± harici veya mutlak olamaz: ${detail}`, row.line),
      )
    } else {
      detailPath = path.resolve(path.dirname(roadmapPath), detail)
      if (!isInsideRepository(repositoryRoot, detailPath)) {
        issues.push(issue('DETAIL_OUTSIDE_REPOSITORY', `AyrÄ±ntÄ± dosyasÄ± depo dÄ±ÅŸÄ±nda: ${detail}`, row.line))
      } else if (!fs.statSync(detailPath, { throwIfNoEntry: false })?.isFile()) {
        issues.push(issue('MISSING_DETAIL_FILE', `AyrÄ±ntÄ± dosyasÄ± bulunamadÄ±: ${detail}`, row.line))
      }
    }

    if (COMPLETION_STATUSES.has(status) && ['â€”', '-', 'Yok'].includes(evidence.trim())) {
      issues.push(issue('MISSING_COMPLETION_EVIDENCE', 'Tamamlanan gÃ¶revler kanÄ±t iÃ§ermelidir.', row.line))
    }

    entries.push({
      id,
      workstream: workstreamMatch?.groups.workstream?.trim() ?? '',
      outcome: workstreamMatch?.groups.outcome?.trim() ?? '',
      status,
      nextGate: nextGate.trim(),
      detail,
      evidence: evidence.trim(),
      line: row.line,
    })
  }

  const ids = new Map()
  for (const entry of entries) {
    if (ids.has(entry.id)) issues.push(issue('DUPLICATE_ID', `Tekrarlanan görev kimliği: ${entry.id}`, entry.line))
    ids.set(entry.id, entry.line)
  }
  const active = entries.filter((entry) => entry.status === 'Devam ediyor')
  if (active.length > 1)
    issues.push(issue('MULTIPLE_ACTIVE_TASKS', 'AynÄ± anda birden fazla aktif gÃ¶rev olamaz.', active[1].line))

  issues.sort((left, right) => left.line - right.line || left.code.localeCompare(right.code))
  return { entries, issues }
}

export { validateRoadmap }

function main() {
  try {
    const { values } = parseArgs({ options: { root: { type: 'string' }, roadmap: { type: 'string' } } })
    const repositoryRoot = path.resolve(values.root ?? process.cwd())
    const roadmapPath = path.resolve(repositoryRoot, values.roadmap ?? 'docs/superpowers/ROADMAP.md')
    const result = validateRoadmap({ repositoryRoot, roadmapPath })
    if (result.issues.length > 0) {
      process.stderr.write(
        `Roadmap validation failed:\n${result.issues.map(({ code, message }) => `[${code}] ${message}`).join('\n')}\n`,
      )
      process.exitCode = 1
      return
    }
    process.stdout.write(`Roadmap validation passed (${result.entries.length} tasks).\n`)
  } catch (error) {
    process.stderr.write(
      `Roadmap validation failed:\n[VALIDATOR_FAILURE] ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
