import { createHash } from 'node:crypto'
import { requireValue } from './contract.mjs'

export function fixtureConfig() {
  return {
    mode: 'synthetic',
    setId: '20261012T000000000Z-0123456789abcdef0123456789abcdef',
    backupClass: 'daily',
    startedAtUtc: '2026-10-12T00:00:00.000Z',
    projectPseudonym: 'synthetic:project',
    hmacKeyVersion: 'synthetic:identity-v1',
    databaseBackupId: 'synthetic:db',
    databaseAttestationRef: 'synthetic:db-attestation',
    operatorVersion: 'synthetic:v1',
    imageDigest: 'synthetic:image',
    configVersion: 'synthetic:v1',
    expectedKmsKeyId: 'synthetic:kms',
  }
}

/** Lazy repeated-byte fixture: metadata only persists, never object payloads. */
export function createSource(objects) {
  const source = {
    objects: structuredClone(objects),
    actualSizeDelta: 0,
    mutateAfterOpen: false,
    chunkBytes: 65536,
    metrics: { opens: 0, maxChunkBytes: 0 },
    async stat(object) {
      return {
        sizeBytes: object.sizeBytes,
        revision: source.mutateAfterOpen && source.metrics.opens > 0 ? 'changed' : object.revision,
      }
    },
    async *open(object, { signal } = {}) {
      source.metrics.opens++
      for (let left = object.sizeBytes + source.actualSizeDelta; left > 0;) {
        requireValue(!signal?.aborted, 'CANCELLED')
        const size = Math.min(left, source.chunkBytes)
        source.metrics.maxChunkBytes = Math.max(source.metrics.maxChunkBytes, size)
        yield Buffer.alloc(size, 97)
        left -= size
      }
    },
  }
  return source
}

/** Consuming protocol model, NOT durable storage or proof of AWS controls. */
export function createTarget() {
  const uploads = new Map()
  const receipts = new Map()
  let sequence = 0
  const hash = (bytes) => createHash('sha256').update(bytes).digest('base64')
  const target = {
    receiptOverrides: {},
    corruptPart: false,
    transientParts: 0,
    partError: '',
    loseCommitResponse: false,
    onPart: () => {},
    metrics: {
      maxInFlight: 0,
      inFlight: 0,
      maxPayloadBytes: 0,
      retainedPayloadBytes: 0,
      partNumbers: [],
      aborts: 0,
      commits: 0,
    },
    async put({ key, body, checksum, retention }) {
      const actual = hash(body)
      requireValue(actual === checksum, 'CHECKSUM_MISMATCH')
      return commit(key, body.byteLength, 'FULL_OBJECT', actual, retention)
    },
    async begin({ key, checksumAlgorithm, checksumType, retention }) {
      requireValue(checksumAlgorithm === 'SHA256' && checksumType === 'COMPOSITE', 'CHECKSUM_MISMATCH')
      const uploadId = `upload-${++sequence}`
      uploads.set(uploadId, { key, retention, parts: [] })
      return { uploadId }
    },
    async part({ uploadId, partNumber, body, checksum }) {
      const upload = uploads.get(uploadId)
      requireValue(upload && partNumber === upload.parts.length + 1, 'PART_INVALID')
      target.metrics.inFlight++
      target.metrics.maxInFlight = Math.max(target.metrics.maxInFlight, target.metrics.inFlight)
      target.metrics.maxPayloadBytes = Math.max(target.metrics.maxPayloadBytes, body.byteLength)
      try {
        // Yield while body is in flight to exercise backpressure.
        await new Promise((resolve) => setTimeout(resolve, 1))
        if (target.transientParts-- > 0) throw new Error('TRANSIENT')
        if (target.partError) throw new Error(target.partError)
        requireValue(hash(body) === checksum, 'CHECKSUM_MISMATCH')
        const receipt = { partNumber, etag: `opaque-${partNumber}`, checksum }
        upload.parts.push({ ...receipt, sizeBytes: body.byteLength })
        target.metrics.partNumbers.push(partNumber)
        target.onPart()
        return { ...receipt, checksum: target.corruptPart ? 'corrupted' : checksum }
      } finally {
        target.metrics.inFlight--
      }
    },
    async complete({ uploadId, parts, checksum }) {
      const upload = uploads.get(uploadId)
      requireValue(
        upload &&
          parts.length === upload.parts.length &&
          parts.every(
            (p, i) =>
              p.partNumber === i + 1 && p.checksum === upload.parts[i].checksum && p.etag === upload.parts[i].etag,
          ),
        'PART_INVALID',
      )
      const composite =
        hash(Buffer.concat(upload.parts.map((p) => Buffer.from(p.checksum, 'base64')))) + `-${parts.length}`
      requireValue(checksum === composite, 'CHECKSUM_MISMATCH')
      const result = commit(
        upload.key,
        upload.parts.reduce((sum, p) => sum + p.sizeBytes, 0),
        'COMPOSITE',
        composite,
        upload.retention,
      )
      uploads.delete(uploadId)
      return result
    },
    async abort({ uploadId }) {
      uploads.delete(uploadId)
      target.metrics.aborts++
    },
    async evidence({ key, versionId }) {
      const receipt = receipts.get(key)
      requireValue(receipt && receipt.versionId === versionId, 'EVIDENCE_INVALID')
      return structuredClone(receipt)
    },
  }
  function commit(key, sizeBytes, checksumType, checksum, retention) {
    // Create-only: ambiguous responses must not cause a blind overwrite.
    requireValue(!receipts.has(key), 'TARGET_EXISTS')
    const receipt = {
      key,
      versionId: `version-${++sequence}`,
      sizeBytes,
      checksumAlgorithm: 'SHA256',
      checksumType,
      checksum,
      encryption: 'aws:kms',
      kmsKeyId: retention.kmsKeyId,
      lockMode: 'COMPLIANCE',
      retainUntilUtc: retention.retainUntilUtc,
      ...target.receiptOverrides,
    }
    receipts.set(key, receipt)
    target.metrics.commits++
    if (target.loseCommitResponse) throw new Error('TRANSIENT')
    return structuredClone(receipt)
  }
  return target
}
