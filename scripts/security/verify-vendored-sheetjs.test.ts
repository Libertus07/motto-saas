import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

import { afterEach, describe, expect, it } from 'vitest'

const scriptPath = resolve('scripts/security/verify-vendored-sheetjs.mjs')
const temporaryDirectories: string[] = []

function createArtifactDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'sheetjs-verifier-'))
  temporaryDirectories.push(directory)
  return directory
}

function writeTarOctal(header: Buffer, offset: number, length: number, value: number): void {
  const encoded = value.toString(8).padStart(length - 1, '0')
  header.write(encoded, offset, length - 1, 'ascii')
  header[offset + length - 1] = 0
}

function createTar(entries: Array<{ name: string; content: string; type?: string }>): Buffer {
  const chunks: Buffer[] = []

  for (const entry of entries) {
    const content = Buffer.from(entry.content, 'utf8')
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100, 'utf8')
    writeTarOctal(header, 100, 8, 0o644)
    writeTarOctal(header, 108, 8, 0)
    writeTarOctal(header, 116, 8, 0)
    writeTarOctal(header, 124, 12, content.length)
    writeTarOctal(header, 136, 12, 0)
    header.fill(0x20, 148, 156)
    header.write(entry.type ?? '0', 156, 1, 'ascii')
    header.write('ustar\0', 257, 6, 'ascii')
    header.write('00', 263, 2, 'ascii')

    const checksum = header.reduce((sum, byte) => sum + byte, 0)
    header.write(checksum.toString(8).padStart(6, '0'), 148, 6, 'ascii')
    header[154] = 0
    header[155] = 0x20

    chunks.push(header, content)
    const padding = (512 - (content.length % 512)) % 512
    if (padding > 0) chunks.push(Buffer.alloc(padding))
  }

  chunks.push(Buffer.alloc(1024))
  return Buffer.concat(chunks)
}

function createTarGzip(entries: Array<{ name: string; content: string; type?: string }>): Buffer {
  return gzipSync(createTar(entries))
}

function createPackageArtifact(packageJson: unknown = { name: 'xlsx', version: '0.20.3' }): Buffer {
  return createTarGzip([
    { name: 'package/README.md', content: 'offline fixture' },
    { name: 'package/package.json', content: JSON.stringify(packageJson) },
  ])
}

function writeArtifact(
  artifactDir: string,
  artifact = createPackageArtifact(),
  manifestForDigest: (digest: string) => string = (digest) => `${digest}  xlsx-0.20.3.tgz\n`,
): string {
  mkdirSync(artifactDir, { recursive: true })
  const digest = createHash('sha256').update(artifact).digest('hex')
  writeFileSync(join(artifactDir, 'xlsx-0.20.3.tgz'), artifact)
  writeFileSync(join(artifactDir, 'xlsx-0.20.3.sha256'), manifestForDigest(digest))
  return digest
}

function runVerifier({
  artifactDir,
  projectDir = process.cwd(),
  skipPackageContract = true,
}: {
  artifactDir?: string
  projectDir?: string
  skipPackageContract?: boolean
}) {
  const args = [scriptPath]
  if (artifactDir) args.push('--artifact-dir', artifactDir)
  if (skipPackageContract) args.push('--skip-package-contract')

  return spawnSync(process.execPath, args, { cwd: projectDir, encoding: 'utf8' })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('verify-vendored-sheetjs', () => {
  it('rejects an artifact whose digest does not match the manifest', () => {
    const root = createArtifactDirectory()
    writeFileSync(join(root, 'xlsx-0.20.3.tgz'), 'tampered')
    writeFileSync(join(root, 'xlsx-0.20.3.sha256'), `${'0'.repeat(64)}  xlsx-0.20.3.tgz\n`)

    const result = runVerifier({ artifactDir: root })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SheetJS verification failed: artifact digest does not match manifest.')
  })

  it.each([
    ['uppercase digest', (digest: string) => `${digest.toUpperCase()}  xlsx-0.20.3.tgz\n`],
    ['single-space separator', (digest: string) => `${digest} xlsx-0.20.3.tgz\n`],
    ['unexpected filename', (digest: string) => `${digest}  xlsx-latest.tgz\n`],
    ['additional line', (digest: string) => `${digest}  xlsx-0.20.3.tgz\nextra\n`],
  ])('rejects manifest grammar with %s', (_caseName, manifestForDigest) => {
    const root = createArtifactDirectory()
    writeArtifact(root, createPackageArtifact(), manifestForDigest)

    const result = runVerifier({ artifactDir: root })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SheetJS verification failed: manifest format is invalid.')
  })

  it('rejects a digest-matched artifact that is not gzip data', () => {
    const root = createArtifactDirectory()
    writeArtifact(root, Buffer.from('not gzip data'))

    const result = runVerifier({ artifactDir: root })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SheetJS verification failed: archive is malformed.')
  })

  it('rejects a tar archive without package metadata', () => {
    const root = createArtifactDirectory()
    writeArtifact(root, createTarGzip([{ name: 'package/README.md', content: 'missing metadata' }]))

    const result = runVerifier({ artifactDir: root })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SheetJS verification failed: archive package metadata is missing.')
  })

  it('rejects malformed embedded package metadata', () => {
    const root = createArtifactDirectory()
    writeArtifact(root, createTarGzip([{ name: 'package/package.json', content: '{invalid json' }]))

    const result = runVerifier({ artifactDir: root })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SheetJS verification failed: archive package metadata is invalid.')
  })

  it.each([
    ['package name', { name: 'not-xlsx', version: '0.20.3' }, 'archive package name is not xlsx.'],
    ['package version', { name: 'xlsx', version: '0.20.2' }, 'archive package version is not 0.20.3.'],
  ])('rejects an unexpected %s', (_caseName, packageJson, expectedMessage) => {
    const root = createArtifactDirectory()
    writeArtifact(root, createPackageArtifact(packageJson))

    const result = runVerifier({ artifactDir: root })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(`SheetJS verification failed: ${expectedMessage}`)
  })

  it('rejects a corrupted tar header even when the digest matches', () => {
    const root = createArtifactDirectory()
    const tar = createTar([
      { name: 'package/package.json', content: JSON.stringify({ name: 'xlsx', version: '0.20.3' }) },
    ])
    tar[0] ^= 0x01
    writeArtifact(root, gzipSync(tar))

    const result = runVerifier({ artifactDir: root })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SheetJS verification failed: archive is malformed.')
  })

  it('rejects a project dependency that is not the exact vendored reference', () => {
    const projectDir = createArtifactDirectory()
    writeArtifact(join(projectDir, 'vendor'))
    writeFileSync(join(projectDir, 'package.json'), JSON.stringify({ dependencies: { xlsx: '^0.20.3' } }))

    const result = runVerifier({ projectDir, skipPackageContract: false })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'SheetJS verification failed: project dependency must be file:vendor/xlsx-0.20.3.tgz.',
    )
  })

  it('accepts a digest-matched official package identity and exact project dependency', () => {
    const projectDir = createArtifactDirectory()
    const digest = writeArtifact(join(projectDir, 'vendor'))
    writeFileSync(
      join(projectDir, 'package.json'),
      JSON.stringify({ dependencies: { xlsx: 'file:vendor/xlsx-0.20.3.tgz' } }),
    )

    const result = runVerifier({ projectDir, skipPackageContract: false })

    expect(result.status).toBe(0)
    expect(result.stdout).toBe(`SheetJS verification passed: ${digest}\n`)
    expect(result.stderr).toBe('')
  })
})
