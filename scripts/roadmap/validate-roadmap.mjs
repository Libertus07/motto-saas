import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const ALLOWED_STATUSES = new Set([
  'Tamamlandı',
  'Yerelde tamam',
  'Devam ediyor',
  'Hazır',
  'Bekliyor',
  'Engelli',
  'Ertelendi',
])
const COMPLETION_STATUSES = new Set(['Tamamlandı', 'Yerelde tamam'])
const TASK_ID_PATTERN = /^[A-Z][A-Z0-9]*-\d{2}$/
const WORKSTREAM_PATTERN = /^\*\*(?<workstream>.+)\*\*<br>Sonuç:\s*(?<outcome>.*)$/u
const DELIVERY_PATTERN =
  /^Sonraki:\s*(?<nextGate>.*?)<br>Detay:\s*\[[^\]]+\]\((?<detail>[^)]+)\)<br>Kanıt:\s*(?<evidence>.*)$/u

function issue(code, message, line) {
  return { code, message, line }
}

function isInsideRepository(repositoryRoot, candidate) {
  const relative = path.relative(repositoryRoot, candidate)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function getGitTrackingState(repositoryRoot, resolvedRepositoryRoot, resolvedDetailPath) {
  const relativeDetailPath = path.relative(resolvedRepositoryRoot, resolvedDetailPath).split(path.sep).join('/')

  try {
    const result = spawnSync('git', ['-C', repositoryRoot, 'ls-files', '--error-unmatch', '--', relativeDetailPath], {
      encoding: 'utf8',
    })
    if (result.error || result.status === null) return 'unverifiable'
    if (result.status === 0) return 'tracked'
    if (result.status === 1) return 'untracked'
  } catch {
    return 'unverifiable'
  }

  return 'unverifiable'
}

const TASK_TABLE_HEADER = ['ID', 'Çalışma alanı ve sonuç', 'Durum', 'Teslimat bilgisi']

function parseTableCells(source) {
  const trimmed = source.trim()
  if (!trimmed.startsWith('|')) return null
  const content = trimmed.slice(1, trimmed.endsWith('|') ? -1 : undefined)
  return content.split('|').map((cell) => cell.trim())
}

function isTaskTableHeader(cells) {
  return cells.length === TASK_TABLE_HEADER.length && cells.every((cell, index) => cell === TASK_TABLE_HEADER[index])
}

function isTableSeparator(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/u.test(cell))
}

function parseTaskRows(markdown) {
  const lines = markdown.split(/\r?\n/u)
  const rows = []
  let inTaskTable = false

  for (let index = 0; index < lines.length; index += 1) {
    const cells = parseTableCells(lines[index])

    if (!inTaskTable) {
      const nextCells = parseTableCells(lines[index + 1] ?? '')
      if (cells && isTaskTableHeader(cells) && nextCells && isTableSeparator(nextCells)) {
        inTaskTable = true
        index += 1
      }
      continue
    }

    if (!cells) {
      inTaskTable = false
      continue
    }

    rows.push({ line: index + 1, cells })
  }

  return rows
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
    return { entries, issues: [issue('ROADMAP_UNREADABLE', `Roadmap okunamadı: ${roadmapPath}`, 0)] }
  }

  const rows = parseTaskRows(markdown)
  if (rows.length === 0) issues.push(issue('NO_TASKS', 'Roadmap içinde görev satırı bulunamadı.', 0))

  for (const row of rows) {
    if (row.cells.length !== 4) {
      issues.push(issue('WRONG_COLUMN_COUNT', 'Görev satırı tam olarak dört hücre içermelidir.', row.line))
      continue
    }

    const rawId = row.cells[0]
    const id = rawId.replace(/^`|`$/gu, '')
    if (!/^`[^`]+`$/u.test(rawId) || !TASK_ID_PATTERN.test(id))
      issues.push(issue('INVALID_ID', `Geçersiz görev kimliği: ${id}`, row.line))

    const workstreamMatch = row.cells[1].match(WORKSTREAM_PATTERN)
    if (!workstreamMatch) {
      const workstream = row.cells[1].match(/^\*\*(.*?)\*\*/u)?.[1]?.trim()
      if (!workstream) issues.push(issue('MISSING_WORKSTREAM', 'Çalışma alanı zorunludur.', row.line))
      const outcome = row.cells[1].match(/Sonuç:\s*(.*)$/u)?.[1]?.trim()
      if (!outcome) issues.push(issue('MISSING_OUTCOME', 'Sonuç zorunludur.', row.line))
      if (workstream && outcome)
        issues.push(issue('MALFORMED_WORKSTREAM_CELL', 'Çalışma alanı hücresi biçimi geçersizdir.', row.line))
    } else {
      if (!workstreamMatch.groups.workstream.trim())
        issues.push(issue('MISSING_WORKSTREAM', 'Çalışma alanı zorunludur.', row.line))
      if (!workstreamMatch.groups.outcome.trim()) issues.push(issue('MISSING_OUTCOME', 'Sonuç zorunludur.', row.line))
    }

    const status = row.cells[2]
    if (!ALLOWED_STATUSES.has(status)) issues.push(issue('INVALID_STATUS', `Geçersiz durum: ${status}`, row.line))

    const deliveryMatch = row.cells[3].match(DELIVERY_PATTERN)
    if (!deliveryMatch) {
      if (!hasLabel(row.cells[3], 'Sonraki'))
        issues.push(issue('MISSING_NEXT_GATE', 'Sonraki kapısı zorunludur.', row.line))
      if (!hasLabel(row.cells[3], 'Kanıt')) issues.push(issue('MISSING_EVIDENCE', 'Kanıt zorunludur.', row.line))
      if (hasLabel(row.cells[3], 'Sonraki') && hasLabel(row.cells[3], 'Kanıt'))
        issues.push(issue('MALFORMED_DELIVERY_CELL', 'Teslimat bilgisi hücresi biçimi geçersizdir.', row.line))
      continue
    }

    const { nextGate, detail, evidence } = deliveryMatch.groups
    if (!nextGate.trim()) issues.push(issue('MISSING_NEXT_GATE', 'Sonraki kapısı zorunludur.', row.line))
    if (!evidence.trim()) issues.push(issue('MISSING_EVIDENCE', 'Kanıt zorunludur.', row.line))

    const externalTarget =
      /^[a-z][a-z\d+.-]*:/iu.test(detail) ||
      detail.startsWith('//') ||
      path.isAbsolute(detail) ||
      detail.startsWith('#') ||
      detail.startsWith('?')
    let detailPath
    if (externalTarget) {
      issues.push(issue('EXTERNAL_DETAIL_LINK', `Ayrıntı bağlantısı harici veya mutlak olamaz: ${detail}`, row.line))
    } else {
      detailPath = path.resolve(path.dirname(roadmapPath), detail)
      let realRepositoryRoot
      let realDetailPath
      let detailReadError
      if (!isInsideRepository(repositoryRoot, detailPath)) {
        issues.push(issue('DETAIL_OUTSIDE_REPOSITORY', `Ayrıntı dosyası depo dışında: ${detail}`, row.line))
      } else {
        try {
          realRepositoryRoot = fs.realpathSync(repositoryRoot)
          realDetailPath = fs.realpathSync(detailPath)
        } catch (error) {
          realRepositoryRoot = repositoryRoot
          detailReadError = error
        }
      }
      if (detailReadError?.code === 'ENOENT') {
        issues.push(issue('MISSING_DETAIL_FILE', `Ayrıntı dosyası bulunamadı: ${detail}`, row.line))
      } else if (detailReadError) {
        issues.push(issue('DETAIL_PATH_UNRESOLVABLE', `Detail path could not be resolved: ${detail}`, row.line))
      } else if (realDetailPath && !isInsideRepository(realRepositoryRoot, realDetailPath)) {
        issues.push(issue('DETAIL_OUTSIDE_REPOSITORY', `Ayrıntı dosyası depo dışında: ${detail}`, row.line))
      } else if (realDetailPath && !fs.statSync(realDetailPath, { throwIfNoEntry: false })?.isFile()) {
        issues.push(issue('MISSING_DETAIL_FILE', `Ayrıntı dosyası bulunamadı: ${detail}`, row.line))
      } else if (realDetailPath && realRepositoryRoot) {
        const trackingState = getGitTrackingState(repositoryRoot, realRepositoryRoot, realDetailPath)
        if (trackingState === 'untracked')
          issues.push(issue('UNTRACKED_DETAIL_FILE', `Ayrıntı dosyası Git tarafından izlenmiyor: ${detail}`, row.line))
        if (trackingState === 'unverifiable')
          issues.push(
            issue('DETAIL_TRACKING_UNVERIFIABLE', `Ayrıntı dosyasının Git takibi doğrulanamadı: ${detail}`, row.line),
          )
      }
    }

    if (COMPLETION_STATUSES.has(status) && ['—', '-', 'Yok'].includes(evidence.trim())) {
      issues.push(issue('MISSING_COMPLETION_EVIDENCE', 'Tamamlanan görevler kanıt içermelidir.', row.line))
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
    issues.push(issue('MULTIPLE_ACTIVE_TASKS', 'Aynı anda birden fazla aktif görev olamaz.', active[1].line))

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
