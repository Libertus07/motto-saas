import { createHash, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs, TextDecoder } from 'node:util'
import { gunzipSync } from 'node:zlib'

const ARTIFACT_NAME = 'xlsx-0.20.3.tgz'
const MANIFEST_NAME = 'xlsx-0.20.3.sha256'
const MANIFEST_PATTERN = /^([a-f0-9]{64})  xlsx-0\.20\.3\.tgz\n$/u
const PACKAGE_ENTRY_NAME = 'package/package.json'
const PACKAGE_NAME = 'xlsx'
const PACKAGE_VERSION = '0.20.3'
const PACKAGE_REFERENCE = 'file:vendor/xlsx-0.20.3.tgz'
const TAR_BLOCK_BYTES = 512

function malformedArchive() {
  return new Error('archive is malformed.')
}

function isZeroBlock(block) {
  return block.every((byte) => byte === 0)
}

function readTarString(header, offset, length) {
  const field = header.subarray(offset, offset + length)
  const terminator = field.indexOf(0)
  return field.subarray(0, terminator === -1 ? field.length : terminator).toString('utf8')
}

function readTarOctal(header, offset, length) {
  const value = readTarString(header, offset, length).trim()
  if (!/^[0-7]+$/u.test(value)) throw malformedArchive()

  const parsed = Number.parseInt(value, 8)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw malformedArchive()
  return parsed
}

function verifyTarHeaderChecksum(header) {
  const expected = readTarOctal(header, 148, 8)
  let actual = 0

  for (let index = 0; index < header.length; index += 1) {
    actual += index >= 148 && index < 156 ? 0x20 : header[index]
  }

  if (actual !== expected) throw malformedArchive()
}

function readPackageMetadata(artifact) {
  let archive
  try {
    archive = gunzipSync(artifact)
  } catch {
    throw malformedArchive()
  }

  if (archive.length === 0 || archive.length % TAR_BLOCK_BYTES !== 0) {
    throw malformedArchive()
  }

  let offset = 0
  let zeroBlocks = 0
  let packageMetadataBytes

  while (offset < archive.length) {
    const header = archive.subarray(offset, offset + TAR_BLOCK_BYTES)
    if (header.length !== TAR_BLOCK_BYTES) throw malformedArchive()

    if (isZeroBlock(header)) {
      zeroBlocks += 1
      offset += TAR_BLOCK_BYTES
      if (zeroBlocks === 2) break
      continue
    }

    if (zeroBlocks !== 0) throw malformedArchive()
    verifyTarHeaderChecksum(header)

    const name = readTarString(header, 0, 100)
    const prefix = readTarString(header, 345, 155)
    const entryName = prefix ? `${prefix}/${name}` : name
    const size = readTarOctal(header, 124, 12)
    const dataStart = offset + TAR_BLOCK_BYTES
    const dataEnd = dataStart + size
    const nextOffset = dataStart + Math.ceil(size / TAR_BLOCK_BYTES) * TAR_BLOCK_BYTES

    if (!entryName || dataEnd > archive.length || nextOffset > archive.length) {
      throw malformedArchive()
    }

    if (entryName === PACKAGE_ENTRY_NAME && packageMetadataBytes === undefined) {
      const type = header[156]
      if (type !== 0 && type !== 0x30) throw malformedArchive()
      packageMetadataBytes = archive.subarray(dataStart, dataEnd)
    }

    offset = nextOffset
  }

  if (zeroBlocks !== 2 || archive.subarray(offset).some((byte) => byte !== 0)) {
    throw malformedArchive()
  }

  if (packageMetadataBytes === undefined) {
    throw new Error('archive package metadata is missing.')
  }

  let packageMetadata
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(packageMetadataBytes)
    packageMetadata = JSON.parse(source)
  } catch {
    throw new Error('archive package metadata is invalid.')
  }

  if (packageMetadata === null || typeof packageMetadata !== 'object' || Array.isArray(packageMetadata)) {
    throw new Error('archive package metadata is invalid.')
  }

  return packageMetadata
}

function readProjectPackage(projectDir) {
  try {
    const packageJson = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf8'))
    if (packageJson === null || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
      throw new Error()
    }
    return packageJson
  } catch {
    throw new Error('project package contract is invalid.')
  }
}

export function verifyVendoredSheetJs({
  artifactDir = 'vendor',
  skipPackageContract = false,
  projectDir = process.cwd(),
} = {}) {
  const resolvedArtifactDir = path.resolve(projectDir, artifactDir)
  const artifact = readFileSync(path.join(resolvedArtifactDir, ARTIFACT_NAME))
  const manifest = readFileSync(path.join(resolvedArtifactDir, MANIFEST_NAME), 'utf8')
  const manifestMatch = manifest.match(MANIFEST_PATTERN)

  if (!manifestMatch) {
    throw new Error('manifest format is invalid.')
  }

  const expectedDigest = Buffer.from(manifestMatch[1], 'hex')
  const actualDigest = createHash('sha256').update(artifact).digest()

  if (expectedDigest.length !== actualDigest.length || !timingSafeEqual(expectedDigest, actualDigest)) {
    throw new Error('artifact digest does not match manifest.')
  }

  const packageMetadata = readPackageMetadata(artifact)
  if (packageMetadata.name !== PACKAGE_NAME) {
    throw new Error('archive package name is not xlsx.')
  }
  if (packageMetadata.version !== PACKAGE_VERSION) {
    throw new Error('archive package version is not 0.20.3.')
  }

  if (!skipPackageContract) {
    const projectPackage = readProjectPackage(path.resolve(projectDir))
    if (projectPackage.dependencies?.xlsx !== PACKAGE_REFERENCE) {
      throw new Error('project dependency must be file:vendor/xlsx-0.20.3.tgz.')
    }
  }

  return {
    digest: actualDigest.toString('hex'),
    packageName: packageMetadata.name,
    packageVersion: packageMetadata.version,
  }
}

function main() {
  try {
    const { values } = parseArgs({
      options: {
        'artifact-dir': { type: 'string' },
        'skip-package-contract': { type: 'boolean', default: false },
      },
    })

    const result = verifyVendoredSheetJs({
      artifactDir: values['artifact-dir'],
      skipPackageContract: values['skip-package-contract'],
    })
    process.stdout.write(`SheetJS verification passed: ${result.digest}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`SheetJS verification failed: ${message}\n`)
    process.exitCode = 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
