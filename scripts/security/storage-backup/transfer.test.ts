import { describe, expect, it } from 'vitest'
import { copyObject, PART_BYTES, CHUNK_BYTES } from './transfer.mjs'
import { fixtureConfig, createSource, createTarget } from './fixtures.mjs'

function setup(sizeBytes = 3) {
  const object = { bucket: 'documents', path: 'fixture.pdf', sizeBytes, revision: 'v1' }
  return {
    object,
    objectId: 'a'.repeat(64),
    config: fixtureConfig(),
    source: createSource([object]),
    target: createTarget(),
    sleep: async () => {},
    random: () => 0.5,
  }
}

describe('bounded synthetic transfer', () => {
  it('pins independent single and multipart SHA-256 vectors', async () => {
    const one = await copyObject(setup(PART_BYTES))
    expect(one.plaintextSha256).toBe('a29968fad2e782aa9f2040a35f05adb97ed8979eb1f572c8c8ea78637e275f3c')
    expect(one.target.checksum).toBe(Buffer.from(one.plaintextSha256, 'hex').toString('base64'))
    const two = await copyObject(setup(PART_BYTES + 1))
    expect(two.plaintextSha256).toBe('0e353bd000756ce37c9349f47d51efd8f250556700fe35ac213a7ab62db44dbb')
    expect(two.target.checksum).toBe('IP2+YB/Xxc4PFiGk08WdcdQH4iMKsJoOp5bgq1111Uw=-2')
    expect(two.target.checksum).not.toBe(Buffer.from(two.plaintextSha256, 'hex').toString('base64'))
  })
  it('checks operator-owned allocation and source chunk overlap', async () => {
    let peak = 0
    await copyObject({
      ...setup(64 * 1024 * 1024),
      measurePayload: (n: number) => {
        peak = Math.max(peak, n)
      },
    })
    expect(peak).toBe(PART_BYTES + CHUNK_BYTES)
    expect(peak).toBeLessThanOrEqual(2 * PART_BYTES + CHUNK_BYTES)
  })
  it.each([0, 3, 5 * 1024 * 1024, 5 * 1024 * 1024 + 1, 64 * 1024 * 1024])(
    'copies %i bytes with bounded payload and sequential parts',
    async (size) => {
      const deps = setup(size)
      const result = await copyObject(deps)
      expect(result.target.sizeBytes).toBe(size)
      expect(result.target.checksumType).toBe(size > PART_BYTES ? 'COMPOSITE' : 'FULL_OBJECT')
      expect(result.attempts).toBe(1)
      expect(deps.target.metrics.maxInFlight).toBeLessThanOrEqual(1)
      expect(deps.target.metrics.maxPayloadBytes + deps.source.metrics.maxChunkBytes).toBeLessThanOrEqual(
        2 * PART_BYTES + CHUNK_BYTES,
      )
      expect(deps.target.metrics.retainedPayloadBytes).toBe(0)
      expect(deps.target.metrics.partNumbers).toEqual(
        Array.from({ length: size > PART_BYTES ? Math.ceil(size / PART_BYTES) : 0 }, (_, i) => i + 1),
      )
    },
  )
  it.each([-1, 1])('rejects actual size delta %i', async (delta) => {
    const deps = setup(PART_BYTES + 1)
    deps.source.actualSizeDelta = delta
    await expect(copyObject(deps)).rejects.toThrow('SIZE_MISMATCH')
    expect(deps.target.metrics.aborts).toBe(1)
  })
  it('rejects same-size revision change', async () => {
    const deps = setup(PART_BYTES + 1)
    deps.source.mutateAfterOpen = true
    await expect(copyObject(deps)).rejects.toThrow('SOURCE_CHANGED')
    expect(deps.target.metrics.aborts).toBe(1)
  })
  it('rejects oversized source chunks', async () => {
    const deps = setup(CHUNK_BYTES + 1)
    deps.source.chunkBytes = CHUNK_BYTES + 1
    await expect(copyObject(deps)).rejects.toThrow('CHUNK_INVALID')
  })
  it.each(['checksum', 'versionId', 'kmsKeyId', 'retainUntilUtc', 'checksumType'])(
    'rejects incorrect target %s',
    async (field) => {
      const deps = setup(PART_BYTES + 1)
      deps.target.receiptOverrides = { [field]: field === 'versionId' ? '' : 'bad' }
      await expect(copyObject(deps)).rejects.toThrow('EVIDENCE_INVALID')
      expect(deps.source.metrics.opens).toBe(1)
    },
  )
  it('rejects corrupt part checksum without retry', async () => {
    const deps = setup(PART_BYTES + 1)
    deps.target.corruptPart = true
    await expect(copyObject(deps)).rejects.toThrow('PART_INVALID')
    expect(deps.target.metrics.aborts).toBe(1)
    expect(deps.source.metrics.opens).toBe(1)
  })
  it('aborts cancelled multipart without committing', async () => {
    const deps = setup(PART_BYTES + 1)
    const controller = new AbortController()
    deps.target.onPart = () => controller.abort()
    await expect(copyObject({ ...deps, signal: controller.signal })).rejects.toThrow('CANCELLED')
    expect(deps.target.metrics.aborts).toBe(1)
    expect(deps.target.metrics.commits).toBe(0)
  })
  it('reopens at most three times with bounded full jitter', async () => {
    const deps = setup(PART_BYTES + 1)
    deps.target.transientParts = 2
    const delays: number[] = []
    const result = await copyObject({
      ...deps,
      sleep: async (ms: number) => {
        delays.push(ms)
      },
    })
    expect(result.attempts).toBe(3)
    expect(delays).toEqual([50, 100])
    expect(deps.source.metrics.opens).toBe(3)
    expect(deps.target.metrics.aborts).toBe(2)
  })
  it('stops after the third transient failure', async () => {
    const deps = setup(PART_BYTES + 1)
    deps.target.transientParts = 5
    await expect(copyObject(deps)).rejects.toThrow('TRANSIENT')
    expect(deps.source.metrics.opens).toBe(3)
  })
  it('does not retry ambiguous committed responses', async () => {
    const deps = setup(PART_BYTES + 1)
    deps.target.loseCommitResponse = true
    await expect(copyObject(deps)).rejects.toThrow('COMMIT_UNCERTAIN')
    expect(deps.target.metrics.commits).toBe(1)
    expect(deps.source.metrics.opens).toBe(1)
  })
  it.each(['AUTH', 'CONFIG_INVALID'])('does not retry %s', async (code) => {
    const deps = setup(PART_BYTES + 1)
    deps.target.partError = code
    await expect(copyObject(deps)).rejects.toThrow(code)
    expect(deps.source.metrics.opens).toBe(1)
  })
})
