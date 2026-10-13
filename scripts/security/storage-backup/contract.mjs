import { createIdentityHasher, parseStorageReference } from '../storage-inventory-contract.mjs'

/** Reject unsafe input without including it in error messages. */
export function requireValue(condition, code) {
  if (!condition) throw new Error(code)
}

export function validUtc(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

const CONFIG_FIELDS = [
  'mode',
  'setId',
  'backupClass',
  'startedAtUtc',
  'projectPseudonym',
  'hmacKeyVersion',
  'databaseBackupId',
  'databaseAttestationRef',
  'operatorVersion',
  'imageDigest',
  'configVersion',
  'expectedKmsKeyId',
]

/** @param {unknown} value Validated synthetic run settings; no environment defaults. */
export function validateConfig(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'CONFIG_INVALID')
  requireValue(
    Object.keys(value).length === CONFIG_FIELDS.length && CONFIG_FIELDS.every((k) => Object.hasOwn(value, k)),
    'CONFIG_INVALID',
  )
  requireValue(
    value.mode === 'synthetic' && ['daily', 'monthly'].includes(value.backupClass) && validUtc(value.startedAtUtc),
    'CONFIG_INVALID',
  )
  const prefix = value.startedAtUtc.replace(/[-:.]/g, '') + '-'
  requireValue(
    typeof value.setId === 'string' &&
      value.setId.startsWith(prefix) &&
      /^[0-9a-f]{32}$/.test(value.setId.slice(prefix.length)),
    'CONFIG_INVALID',
  )
  for (const field of CONFIG_FIELDS.slice(4)) {
    requireValue(
      typeof value[field] === 'string' && /^synthetic:[a-zA-Z0-9_-]{1,100}$/.test(value[field]),
      'CONFIG_INVALID',
    )
  }
  return { ...value }
}

/** Retention measured from immutable run start, not retry time. */
export function retentionUntil(config) {
  validateConfig(config)
  return new Date(
    Date.parse(config.startedAtUtc) + (config.backupClass === 'monthly' ? 365 : 90) * 86400000,
  ).toISOString()
}

/** Preserve the inventory's exact bucket/NUL/path identity encoding. */
export function identifyObject(object, key) {
  requireValue(
    object &&
      typeof object.bucket === 'string' &&
      typeof object.path === 'string' &&
      Number.isSafeInteger(object.sizeBytes) &&
      object.sizeBytes >= 0 &&
      typeof object.revision === 'string' &&
      object.revision.length > 0,
    'OBJECT_INVALID',
  )
  requireValue(
    parseStorageReference(`storage://${object.bucket}/${object.path}`).status === 'storage' &&
      !object.bucket.includes('/'),
    'OBJECT_INVALID',
  )
  requireValue(Buffer.isBuffer(key) && key.length >= 32, 'IDENTITY_KEY_INVALID')
  return createIdentityHasher(key)(object.bucket, object.path)
}

/** Deterministic JSON subset. Reject lossy serialization, getters, and cycles. */
export function canonicalBytes(value) {
  const ancestors = new Set()
  function encode(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item)
    if (typeof item === 'number') {
      requireValue(Number.isFinite(item), 'CANONICAL_INVALID')
      return JSON.stringify(item)
    }
    requireValue(item && typeof item === 'object' && !ancestors.has(item), 'CANONICAL_INVALID')
    requireValue(
      Array.isArray(item) || Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null,
      'CANONICAL_INVALID',
    )
    requireValue(Object.getOwnPropertySymbols(item).length === 0, 'CANONICAL_INVALID')
    ancestors.add(item)
    const keys = Object.keys(item)
    for (const k of keys)
      requireValue(Object.hasOwn(Object.getOwnPropertyDescriptor(item, k), 'value'), 'CANONICAL_INVALID')
    let result
    if (Array.isArray(item)) {
      requireValue(keys.length === item.length && keys.every((k, i) => k === String(i)), 'CANONICAL_INVALID')
      result = '[' + item.map(encode).join(',') + ']'
    } else {
      result =
        '{' +
        keys
          .sort()
          .map((k) => JSON.stringify(k) + ':' + encode(item[k]))
          .join(',') +
        '}'
    }
    ancestors.delete(item)
    return result
  }
  return Buffer.from(encode(value), 'utf8')
}

/** Validate explicit target evidence; ETag is never consulted. */
export function validateTargetEvidence(actual, expected) {
  requireValue(
    actual && expected && typeof actual.versionId === 'string' && actual.versionId.trim().length > 0,
    'EVIDENCE_INVALID',
  )
  requireValue(Number.isSafeInteger(actual.sizeBytes) && actual.sizeBytes >= 0, 'EVIDENCE_INVALID')
  for (const field of ['key', 'sizeBytes', 'checksumType', 'checksum', 'kmsKeyId']) {
    requireValue(actual[field] === expected[field], 'EVIDENCE_INVALID')
  }
  requireValue(
    actual.checksumAlgorithm === 'SHA256' && actual.encryption === 'aws:kms' && actual.lockMode === 'COMPLIANCE',
    'EVIDENCE_INVALID',
  )
  requireValue(
    validUtc(actual.retainUntilUtc) &&
      validUtc(expected.minimumRetainUntilUtc) &&
      Date.parse(actual.retainUntilUtc) >= Date.parse(expected.minimumRetainUntilUtc),
    'EVIDENCE_INVALID',
  )
}
