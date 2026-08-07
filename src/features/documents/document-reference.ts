export type PrivateDocumentBucket = 'motto_assets' | 'receipts'

export type PrivateDocumentKind = 'supplier-receipt' | 'investment-receipt' | 'investment-document' | 'z-report'

export interface StorageDocumentReference {
  bucket: PrivateDocumentBucket
  path: string
}

export interface UploadOrganizationDocumentInput {
  organizationId: string
  bucket: PrivateDocumentBucket
  kind: PrivateDocumentKind
  file: File
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const THREE_MIB = 3 * 1024 * 1024
const TEN_MIB = 10 * 1024 * 1024

const extensionByMimeType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/json': 'json',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
} as const

const standardDocumentMimeTypes = new Set<keyof typeof extensionByMimeType>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

const zReportMimeTypes = new Set<keyof typeof extensionByMimeType>([
  ...standardDocumentMimeTypes,
  'application/xml',
  'text/xml',
  'application/json',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

const supplierReceiptMimeTypes = zReportMimeTypes

function isPrivateDocumentBucket(value: string): value is PrivateDocumentBucket {
  return value === 'motto_assets' || value === 'receipts'
}

function hasSafePathSegment(segment: string): boolean {
  if (!segment) {
    return false
  }

  try {
    const decodedSegment = decodeURIComponent(segment)
    return (
      decodedSegment !== '' &&
      decodedSegment !== '.' &&
      decodedSegment !== '..' &&
      !/[\\/?#]/.test(decodedSegment) &&
      !/%[0-9a-f]{2}/i.test(decodedSegment)
    )
  } catch {
    return false
  }
}

function hasSafeObjectPath(path: string): boolean {
  return !path.startsWith('/') && path.split('/').every(hasSafePathSegment)
}

function hasUnsafePathSegment(path: string): boolean {
  return path.split('/').some((segment) => segment !== '' && !hasSafePathSegment(segment))
}

function getMimeType(file: File): keyof typeof extensionByMimeType | null {
  const mimeType = file.type.toLowerCase()
  return mimeType in extensionByMimeType ? (mimeType as keyof typeof extensionByMimeType) : null
}

function expectedBucketForKind(kind: PrivateDocumentKind): PrivateDocumentBucket {
  return kind === 'z-report' ? 'receipts' : 'motto_assets'
}

export function serializeStorageDocumentReference(reference: StorageDocumentReference): string {
  if (!isPrivateDocumentBucket(reference.bucket) || !hasSafeObjectPath(reference.path)) {
    throw new Error('Geçersiz belge depolama referansı.')
  }

  return `storage://${reference.bucket}/${reference.path}`
}

export function parseStorageDocumentReference(value: string): StorageDocumentReference | null {
  const match = /^storage:\/\/([^/]+)\/(.+)$/.exec(value)

  if (!match) {
    return null
  }

  const [, bucket, path] = match
  if (!isPrivateDocumentBucket(bucket) || !hasSafeObjectPath(path)) {
    return null
  }

  return { bucket, path }
}

export function parseLegacyPublicStorageUrl(value: string): StorageDocumentReference | null {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'https:') {
    return null
  }

  const pathStartIndex = value.indexOf('/', value.indexOf('://') + 3)
  const rawPath = pathStartIndex === -1 ? '' : value.slice(pathStartIndex).split(/[?#]/, 1)[0]
  if (hasUnsafePathSegment(rawPath)) {
    return null
  }

  const segments = url.pathname.split('/')
  if (
    segments[0] !== '' ||
    segments[1] !== 'storage' ||
    segments[2] !== 'v1' ||
    segments[3] !== 'object' ||
    segments[4] !== 'public'
  ) {
    return null
  }

  const bucket = segments[5]
  const path = segments.slice(6).join('/')

  if (!bucket || !isPrivateDocumentBucket(bucket) || !hasSafeObjectPath(path)) {
    return null
  }

  return { bucket, path }
}

export function validateOrganizationDocument(input: UploadOrganizationDocumentInput): string | null {
  if (!UUID_PATTERN.test(input.organizationId)) {
    return 'Geçerli bir kuruluş kimliği gerekli.'
  }

  if (input.bucket !== expectedBucketForKind(input.kind)) {
    return 'Belge türü için geçersiz depolama alanı.'
  }

  const mimeType = getMimeType(input.file)
  const allowedMimeTypes =
    input.kind === 'z-report'
      ? zReportMimeTypes
      : input.kind === 'supplier-receipt'
        ? supplierReceiptMimeTypes
        : standardDocumentMimeTypes
  if (!mimeType || !allowedMimeTypes.has(mimeType)) {
    return 'Bu belge türü desteklenmiyor.'
  }

  const maximumSize = input.kind === 'z-report' || input.kind === 'supplier-receipt' ? TEN_MIB : THREE_MIB
  if (input.file.size > maximumSize) {
    return 'Dosya boyutu izin verilen sınırı aşıyor.'
  }

  return null
}

export function buildOrganizationDocumentPath(input: UploadOrganizationDocumentInput): string {
  const validationError = validateOrganizationDocument(input)
  if (validationError) {
    throw new Error(validationError)
  }

  const mimeType = getMimeType(input.file)
  if (!mimeType) {
    throw new Error('Bu belge türü desteklenmiyor.')
  }

  return `${input.organizationId}/${input.kind}/${crypto.randomUUID()}.${extensionByMimeType[mimeType]}`
}
