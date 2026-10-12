import { createHash } from 'node:crypto'
import { requireValue, validateConfig, retentionUntil, validateTargetEvidence } from './contract.mjs'

export const PART_BYTES = 5 * 1024 * 1024
export const CHUNK_BYTES = 64 * 1024
const digest = (bytes) => createHash('sha256').update(bytes).digest('base64')

/** Sequential, bounded payload transfer. Dependencies are offline fixture adapters. */
export async function copyObject({
  object,
  objectId,
  config,
  source,
  target,
  signal = /** @type {AbortSignal | undefined} */ (undefined),
  sleep,
  random,
  measurePayload = /** @type {(bytes: number) => void} */ (() => {}),
}) {
  validateConfig(config)
  requireValue(
    /^[a-f0-9]{64}$/.test(objectId) && Number.isSafeInteger(object.sizeBytes) && object.sizeBytes >= 0,
    'OBJECT_INVALID',
  )
  const key = `backup-sets/${config.backupClass}/${config.setId}/objects/${objectId}`
  const retention = { kmsKeyId: config.expectedKmsKeyId, retainUntilUtc: retentionUntil(config) }
  const check = () => requireValue(!signal?.aborted, 'CANCELLED')
  const unchanged = async () => {
    check()
    const current = await source.stat(object)
    requireValue(current.revision === object.revision && current.sizeBytes === object.sizeBytes, 'SOURCE_CHANGED')
    check()
  }
  for (let attempts = 1; attempts <= 3; attempts++) {
    let uploadId
    let commitAttempted = false
    let committed = false
    try {
      await unchanged()
      const multipart = object.sizeBytes > PART_BYTES
      if (multipart) {
        const begun = await target.begin({ key, checksumAlgorithm: 'SHA256', checksumType: 'COMPOSITE', retention })
        uploadId = begun.uploadId
        requireValue(typeof uploadId === 'string' && uploadId.length > 0, 'PART_INVALID')
      }
      const whole = createHash('sha256')
      // One reusable part buffer; awaited target methods must release the borrowed view.
      const buffer = Buffer.alloc(Math.min(PART_BYTES, object.sizeBytes))
      measurePayload(buffer.byteLength)
      let filled = 0
      let total = 0
      const parts = []
      async function sendPart() {
        check()
        const body = buffer.subarray(0, filled)
        const checksum = digest(body)
        const partNumber = parts.length + 1
        requireValue(partNumber <= 10000, 'OBJECT_TOO_LARGE')
        const receipt = await target.part({ uploadId, partNumber, body, checksum })
        requireValue(
          receipt?.partNumber === partNumber &&
            receipt.checksum === checksum &&
            typeof receipt.etag === 'string' &&
            receipt.etag.length > 0,
          'PART_INVALID',
        )
        parts.push({ partNumber, etag: receipt.etag, checksum })
        filled = 0
        check()
      }
      for await (const chunk of source.open(object, { signal })) {
        check()
        requireValue(
          chunk instanceof Uint8Array && chunk.byteLength > 0 && chunk.byteLength <= CHUNK_BYTES,
          'CHUNK_INVALID',
        )
        measurePayload(buffer.byteLength + chunk.byteLength)
        total += chunk.byteLength
        requireValue(total <= object.sizeBytes, 'SIZE_MISMATCH')
        whole.update(chunk)
        for (let offset = 0; offset < chunk.byteLength;) {
          const count = Math.min(buffer.length - filled, chunk.byteLength - offset)
          buffer.set(chunk.subarray(offset, offset + count), filled)
          offset += count
          filled += count
          if (multipart && filled === PART_BYTES) await sendPart()
        }
      }
      requireValue(total === object.sizeBytes, 'SIZE_MISMATCH')
      await unchanged()
      if (multipart && filled > 0) await sendPart()
      const plaintextSha256 = whole.digest('hex')
      const checksum = multipart
        ? digest(Buffer.concat(parts.map((p) => Buffer.from(p.checksum, 'base64')))) + `-${parts.length}`
        : Buffer.from(plaintextSha256, 'hex').toString('base64')
      const checksumType = multipart ? 'COMPOSITE' : 'FULL_OBJECT'
      check()
      commitAttempted = true
      const receipt = multipart
        ? await target.complete({ uploadId, parts, checksum })
        : await target.put({ key, body: buffer, checksum, retention })
      committed = true
      check()
      await unchanged()
      const expected = {
        key,
        sizeBytes: object.sizeBytes,
        checksumType,
        checksum,
        kmsKeyId: config.expectedKmsKeyId,
        minimumRetainUntilUtc: retention.retainUntilUtc,
      }
      validateTargetEvidence(receipt, expected)
      const verified = await target.evidence({ key, versionId: receipt.versionId })
      validateTargetEvidence(verified, expected)
      requireValue(verified.versionId === receipt.versionId, 'EVIDENCE_INVALID')
      check()
      return { objectId, revision: object.revision, plaintextSha256, target: verified, attempts }
    } catch (error) {
      if (uploadId && !committed) {
        try {
          await target.abort({ uploadId })
        } catch {
          throw new Error('ABORT_FAILED')
        }
      }
      check()
      if (commitAttempted && !committed) throw new Error('COMMIT_UNCERTAIN')
      if (error?.message !== 'TRANSIENT' || attempts === 3 || commitAttempted) throw error
      const jitter = random()
      requireValue(Number.isFinite(jitter) && jitter >= 0 && jitter <= 1, 'CONFIG_INVALID')
      await sleep(jitter * 100 * 2 ** (attempts - 1))
    }
  }
  throw new Error('TRANSFER_FAILED')
}
