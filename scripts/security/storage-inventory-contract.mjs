import { createHmac } from 'node:crypto'

const EXPECTED_PROJECT_REF = 'zahdmrvhxsmqpeesrfkt'
const SAFE_SEGMENT_PATTERN = /^[^/\\?#%\u0000-\u001f]+$/u
const STORAGE_PREFIX = 'storage://'
const LEGACY_PUBLIC_PREFIX = ['storage', 'v1', 'object', 'public']
const LEGACY_PUBLIC_HOST = `${EXPECTED_PROJECT_REF}.supabase.co`

function invalidReference() {
  return { status: 'invalid' }
}

function isSafePath(bucket, objectPath) {
  if (!SAFE_SEGMENT_PATTERN.test(bucket) || typeof objectPath !== 'string') return false
  const segments = objectPath.split('/')
  return (
    segments.length > 0 &&
    segments.every((segment) => SAFE_SEGMENT_PATTERN.test(segment) && segment !== '.' && segment !== '..')
  )
}

function parseLegacyPublicStorageUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return invalidReference()
  }

  if (url.protocol !== 'https:' || url.host !== LEGACY_PUBLIC_HOST || url.username !== '' || url.password !== '') {
    return invalidReference()
  }

  const rawPath = value.slice(value.indexOf('/', value.indexOf('://') + 3)).split(/[?#]/u, 1)[0]
  if (!rawPath || rawPath.includes('%') || rawPath.includes('\\')) return invalidReference()

  const segments = rawPath.split('/').slice(1)
  if (LEGACY_PUBLIC_PREFIX.some((part, index) => segments[index] !== part)) return invalidReference()

  const bucket = segments[4]
  const objectPath = segments.slice(5).join('/')
  if (!isSafePath(bucket, objectPath)) return invalidReference()

  return { status: 'legacy_public', bucket, path: objectPath }
}

function classifyReference(value) {
  if (typeof value !== 'string') return invalidReference()
  if (value.startsWith(STORAGE_PREFIX)) return parseStorageReference(value)
  if (value.startsWith('data:')) return { status: 'legacy_data' }
  if (value.startsWith('https://')) return parseLegacyPublicStorageUrl(value)
  return invalidReference()
}

function requireCanonicalTimestamp(value) {
  if (typeof value !== 'string') throw new Error('inventory_capture_time_invalid')
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error('inventory_capture_time_invalid')
  }
  return value
}

function normalizeSize(value) {
  const size = typeof value === 'string' && /^\d+$/u.test(value) ? Number(value) : value
  if (!Number.isSafeInteger(size) || size < 0) throw new Error('inventory_object_size_invalid')
  return size
}

function normalizeObjectRow(row) {
  if (!row || !isSafePath(row.bucket_id, row.name)) throw new Error('inventory_object_row_invalid')
  return {
    bucket: row.bucket_id,
    path: row.name,
    sizeBytes: normalizeSize(row.size_bytes),
    updatedAt: requireCanonicalTimestamp(row.updated_at),
  }
}

function normalizeBucketRow(row) {
  if (!row || !SAFE_SEGMENT_PATTERN.test(row.id) || typeof row.public !== 'boolean') {
    throw new Error('inventory_bucket_row_invalid')
  }
  const fileSizeLimit = row.file_size_limit === null ? null : normalizeSize(row.file_size_limit)
  const allowedMimeTypes = row.allowed_mime_types === null ? null : [...row.allowed_mime_types].sort()
  if (allowedMimeTypes !== null && !allowedMimeTypes.every((value) => typeof value === 'string')) {
    throw new Error('inventory_bucket_row_invalid')
  }
  return {
    id: row.id,
    public: row.public,
    file_size_limit: fileSizeLimit,
    allowed_mime_types: allowedMimeTypes,
  }
}

function sameObjectMetadata(left, right) {
  return left.sizeBytes === right.sizeBytes && left.updatedAt === right.updatedAt
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function objectKey(bucket, objectPath) {
  return `${bucket}\u0000${objectPath}`
}

export function parseStorageReference(value) {
  if (typeof value !== 'string' || !value.startsWith(STORAGE_PREFIX)) return invalidReference()
  const remainder = value.slice(STORAGE_PREFIX.length)
  const slash = remainder.indexOf('/')
  if (slash < 1) return invalidReference()
  const bucket = remainder.slice(0, slash)
  const objectPath = remainder.slice(slash + 1)
  if (!isSafePath(bucket, objectPath)) return invalidReference()
  return { status: 'storage', bucket, path: objectPath }
}

export function createIdentityHasher(key) {
  if (!Buffer.isBuffer(key) || key.length < 32) throw new Error('inventory_hmac_key_invalid')
  return (bucket, objectPath) => createHmac('sha256', key).update(objectKey(bucket, objectPath)).digest('hex')
}

export function buildStorageInventory({ projectRef, capturedAt, buckets, objects, references, hashIdentity }) {
  if (projectRef !== EXPECTED_PROJECT_REF) throw new Error('inventory_project_ref_invalid')
  const capturedAtUtc = requireCanonicalTimestamp(capturedAt)
  if (typeof hashIdentity !== 'function') throw new Error('inventory_identity_hasher_invalid')
  if (![buckets, objects, references].every(Array.isArray)) throw new Error('inventory_rows_invalid')

  const normalizedBuckets = buckets.map(normalizeBucketRow).sort((a, b) => compareText(a.id, b.id))
  const bucketById = new Map()
  for (const bucket of normalizedBuckets) {
    const existing = bucketById.get(bucket.id)
    if (existing && JSON.stringify(existing) !== JSON.stringify(bucket)) {
      throw new Error('inventory_bucket_rows_conflict')
    }
    bucketById.set(bucket.id, bucket)
  }

  const normalizedObjects = objects
    .map(normalizeObjectRow)
    .sort((a, b) => compareText(objectKey(a.bucket, a.path), objectKey(b.bucket, b.path)))
  const objectByKey = new Map()
  const conflictingObjectKeys = new Set()
  for (const object of normalizedObjects) {
    const key = objectKey(object.bucket, object.path)
    const existing = objectByKey.get(key)
    if (existing && !sameObjectMetadata(existing, object)) conflictingObjectKeys.add(key)
    if (!existing) objectByKey.set(key, object)
  }

  const uniqueReferences = new Map()
  const sortedReferences = [...references].sort((left, right) =>
    compareText(
      `${String(left?.source_table)}\u0000${String(left?.source_id)}\u0000${String(left?.document_url)}`,
      `${String(right?.source_table)}\u0000${String(right?.source_id)}\u0000${String(right?.document_url)}`,
    ),
  )
  for (const reference of sortedReferences) {
    if (!reference || typeof reference.source_table !== 'string' || typeof reference.source_id !== 'string') {
      throw new Error('inventory_reference_row_invalid')
    }
    const key = `${reference.source_table}\u0000${reference.source_id}`
    if (!uniqueReferences.has(key)) uniqueReferences.set(key, reference)
  }

  const referencedObjectKeys = new Set()
  let invalidReferences = 0
  let legacyDataReferences = 0
  let legacyPublicReferences = 0
  for (const reference of uniqueReferences.values()) {
    const parsed = classifyReference(reference.document_url)
    if (parsed.status === 'invalid') invalidReferences += 1
    if (parsed.status === 'legacy_data') legacyDataReferences += 1
    if (parsed.status === 'legacy_public') legacyPublicReferences += 1
    if (parsed.status === 'storage' || parsed.status === 'legacy_public') {
      referencedObjectKeys.add(objectKey(parsed.bucket, parsed.path))
    }
  }

  const objectKeys = [...objectByKey.keys()].sort(compareText)
  const missingKeys = [...referencedObjectKeys].filter((key) => !objectByKey.has(key)).sort(compareText)
  const unreferencedKeys = objectKeys.filter((key) => !referencedObjectKeys.has(key))
  const toIdentity = (key) => {
    const separator = key.indexOf('\u0000')
    return hashIdentity(key.slice(0, separator), key.slice(separator + 1))
  }

  const bucketFacts = [...bucketById.values()].map((bucket) => {
    const bucketObjects = [...objectByKey.values()].filter((object) => object.bucket === bucket.id)
    return {
      ...bucket,
      object_count: bucketObjects.length,
      total_size_bytes: bucketObjects.reduce((total, object) => total + object.sizeBytes, 0),
    }
  })

  return {
    schema_version: 'motto-saas-storage-inventory-v1',
    project_ref: projectRef,
    captured_at_utc: capturedAtUtc,
    physical_bytes_verified: false,
    totals: {
      buckets: bucketById.size,
      objects: objectByKey.size,
      references: uniqueReferences.size,
      referenced_missing_objects: missingKeys.length,
      unreferenced_objects: unreferencedKeys.length,
      invalid_references: invalidReferences,
      legacy_data_references: legacyDataReferences,
      legacy_public_references: legacyPublicReferences,
      conflicting_object_rows: conflictingObjectKeys.size,
    },
    buckets: bucketFacts,
    object_ids: objectKeys.map(toIdentity).sort(compareText),
    referenced_missing_object_ids: missingKeys.map(toIdentity).sort(compareText),
    unreferenced_object_ids: unreferencedKeys.map(toIdentity).sort(compareText),
    conflicting_object_ids: [...conflictingObjectKeys].map(toIdentity).sort(compareText),
  }
}
