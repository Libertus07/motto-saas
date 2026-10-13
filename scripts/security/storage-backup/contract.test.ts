import { describe, expect, it } from 'vitest'
import { createIdentityHasher } from '../storage-inventory-contract.mjs'
import { canonicalBytes, identifyObject, validateConfig, validateTargetEvidence, retentionUntil } from './contract.mjs'

const config = {
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
const object = { bucket: 'documents', path: 'şube/fiş.pdf', sizeBytes: 0, revision: 'v1' }
const key = Buffer.alloc(32, 7)
const checksum = '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='
const expected = {
  key: 'backup-sets/daily/set/objects/id',
  sizeBytes: 0,
  checksumType: 'FULL_OBJECT',
  checksum,
  kmsKeyId: 'synthetic:kms',
  minimumRetainUntilUtc: '2027-01-10T00:00:00.000Z',
}
const evidence = {
  ...expected,
  versionId: 'opaque-version',
  checksumAlgorithm: 'SHA256',
  encryption: 'aws:kms',
  lockMode: 'COMPLIANCE',
  retainUntilUtc: expected.minimumRetainUntilUtc,
}

describe('synthetic backup contract', () => {
  it('preserves the inventory identity contract', () => {
    expect(identifyObject(object, key)).toBe(createIdentityHasher(key)(object.bucket, object.path))
  })
  it('does not merge path boundaries, casing or Unicode forms', () => {
    const inputs = [
      ['a', 'b/c'],
      ['a/b', 'c'],
      ['a', 'B/c'],
      ['a', 'é'],
      ['a', 'e\u0301'],
    ]
    expect(() => identifyObject({ ...object, bucket: 'a/b', path: 'c' }, key)).toThrow()
    const ids = inputs
      .filter(([bucket]) => !bucket.includes('/'))
      .map(([bucket, path]) => identifyObject({ ...object, bucket, path }, key))
    expect(new Set(ids).size).toBe(4)
  })
  it.each(['../x', 'x//y', 'x%2Fy', 'x\u0000y', 'x\\y', ''])('rejects unsafe path %j', (path) => {
    expect(() => identifyObject({ ...object, path }, key)).toThrow('OBJECT_INVALID')
  })
  it.each([-1, NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe size %s', (sizeBytes) => {
    expect(() => identifyObject({ ...object, sizeBytes }, key)).toThrow('OBJECT_INVALID')
  })
  it('rejects absent revision and short identity keys', () => {
    expect(() => identifyObject({ ...object, revision: '' }, key)).toThrow()
    expect(() => identifyObject(object, Buffer.alloc(31))).toThrow()
  })
  it('accepts only complete synthetic config and ties its ID to capture time', () => {
    expect(validateConfig(config)).toEqual(config)
    for (const patch of [
      { mode: 'production' },
      { extra: true },
      { setId: '../x' },
      { startedAtUtc: '2026-10-12' },
      { setId: '20261013T000000000Z-0123456789abcdef0123456789abcdef' },
      { databaseBackupId: '' },
      { imageDigest: 'real-image' },
      { backupClass: 'weekly' },
    ]) {
      expect(() => validateConfig({ ...config, ...patch })).toThrow('CONFIG_INVALID')
    }
  })
  it('computes exact UTC daily and monthly retention boundaries', () => {
    expect(retentionUntil(config)).toBe('2027-01-10T00:00:00.000Z')
    expect(retentionUntil({ ...config, backupClass: 'monthly' })).toBe('2027-10-12T00:00:00.000Z')
  })
  it('canonicalizes nested objects but preserves array order', () => {
    expect(canonicalBytes({ z: [2, 1], a: { b: 2, a: 1 } }).toString()).toBe('{"a":{"a":1,"b":2},"z":[2,1]}')
  })
  it.each([undefined, NaN, Infinity, BigInt(1), new Date(), { x: undefined }, [undefined], new Map(), () => 1])(
    'rejects unsupported canonical values %#',
    (value) => {
      expect(() => canonicalBytes(value)).toThrow('CANONICAL_INVALID')
    },
  )
  it('rejects sparse arrays, cycles and custom serialization', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    for (const value of [
      new Array(1),
      cyclic,
      {
        toJSON() {
          return 'secret'
        },
      },
    ]) {
      expect(() => canonicalBytes(value)).toThrow('CANONICAL_INVALID')
    }
  })
  it('accepts matching integrity, encryption and retention evidence', () => {
    expect(() => validateTargetEvidence(evidence, expected)).not.toThrow()
  })
  it.each([
    { versionId: '' },
    { versionId: undefined },
    { key: 'wrong' },
    { sizeBytes: 1 },
    { checksum: 'wrong' },
    { checksumType: 'COMPOSITE' },
    { checksumAlgorithm: 'MD5' },
    { kmsKeyId: 'wrong' },
    { encryption: 'AES256' },
    { lockMode: 'GOVERNANCE' },
    { retainUntilUtc: '2027-01-09T23:59:59.999Z' },
    { retainUntilUtc: 'invalid' },
  ])('rejects mismatching receipt %#', (patch) => {
    expect(() => validateTargetEvidence({ ...evidence, ...patch }, expected)).toThrow('EVIDENCE_INVALID')
  })
  it('rejects a monthly receipt one millisecond short', () => {
    expect(() =>
      validateTargetEvidence(
        { ...evidence, retainUntilUtc: '2027-10-11T23:59:59.999Z' },
        { ...expected, minimumRetainUntilUtc: '2027-10-12T00:00:00.000Z' },
      ),
    ).toThrow()
  })
})
