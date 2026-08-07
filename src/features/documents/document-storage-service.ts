import type { SupabaseClient } from '@supabase/supabase-js'

import { devError } from '@/lib/debug'

import {
  buildOrganizationDocumentPath,
  parseLegacyPublicStorageUrl,
  parseStorageDocumentReference,
  serializeStorageDocumentReference,
  validateOrganizationDocument,
} from './document-reference'
import type { StorageDocumentReference, UploadOrganizationDocumentInput } from './document-reference'

const DEFAULT_SIGNED_URL_LIFETIME_SECONDS = 300
const SAFE_DATA_URL_PREFIXES = [
  'data:image/jpeg;base64,',
  'data:image/png;base64,',
  'data:image/webp;base64,',
  'data:application/pdf;base64,',
] as const

function parseManagedStorageReference(storedReference: string): StorageDocumentReference | null {
  return parseStorageDocumentReference(storedReference) ?? parseLegacyPublicStorageUrl(storedReference)
}

function isSafeDataUrl(storedReference: string): boolean {
  const prefix = SAFE_DATA_URL_PREFIXES.find((candidate) => storedReference.startsWith(candidate))
  if (!prefix) {
    return false
  }

  const payload = storedReference.slice(prefix.length)
  return payload.length > 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(payload) && payload.length % 4 === 0
}

function isExternalHttpsUrl(storedReference: string): boolean {
  try {
    return new URL(storedReference).protocol === 'https:'
  } catch {
    return false
  }
}

function isStorageReferenceCandidate(storedReference: string): boolean {
  if (storedReference.startsWith('storage://')) {
    return true
  }

  try {
    const url = new URL(storedReference)
    return url.protocol === 'https:' && url.pathname.startsWith('/storage/v1/object/public/')
  } catch {
    return false
  }
}

export async function uploadOrganizationDocument(
  supabase: SupabaseClient,
  input: UploadOrganizationDocumentInput,
): Promise<string> {
  const validationError = validateOrganizationDocument(input)
  if (validationError) {
    throw new Error(validationError)
  }

  const path = buildOrganizationDocumentPath(input)
  let uploadError: Error | null = null

  try {
    ;({ error: uploadError } = await supabase.storage.from(input.bucket).upload(path, input.file, {
      contentType: input.file.type,
      cacheControl: '3600',
      upsert: false,
    }))
  } catch (error) {
    devError('Belge depolamaya yüklenemedi.', error)
    throw new Error('Belge yüklenemedi. Lütfen tekrar deneyin.')
  }

  if (uploadError) {
    devError('Belge depolamaya yüklenemedi.', uploadError)
    throw new Error('Belge yüklenemedi. Lütfen tekrar deneyin.')
  }

  return serializeStorageDocumentReference({ bucket: input.bucket, path })
}

export async function removeOrganizationDocument(supabase: SupabaseClient, storedReference: string): Promise<void> {
  const reference = parseManagedStorageReference(storedReference)
  if (!reference) {
    return
  }

  const { error } = await supabase.storage.from(reference.bucket).remove([reference.path])
  if (error) {
    throw error
  }
}

export async function resolveDocumentPreviewUrl(
  supabase: SupabaseClient,
  storedReference: string,
  expiresInSeconds = DEFAULT_SIGNED_URL_LIFETIME_SECONDS,
): Promise<string> {
  const managedReference = parseManagedStorageReference(storedReference)
  if (managedReference) {
    let data: { signedUrl: string } | null = null
    let signingError: Error | null = null

    try {
      ;({ data, error: signingError } = await supabase.storage
        .from(managedReference.bucket)
        .createSignedUrl(managedReference.path, expiresInSeconds))
    } catch (error) {
      devError('Belge için imzalı bağlantı oluşturulamadı.', error)
      throw new Error('Belge görüntülenemedi. Lütfen tekrar deneyin.')
    }

    if (signingError || !data?.signedUrl) {
      devError('Belge için imzalı bağlantı oluşturulamadı.', signingError ?? new Error('İmzalı bağlantı bulunamadı.'))
      throw new Error('Belge görüntülenemedi. Lütfen tekrar deneyin.')
    }

    return data.signedUrl
  }

  if (isStorageReferenceCandidate(storedReference)) {
    throw new Error('Belge bağlantısı güvenli değil veya desteklenmiyor.')
  }

  if (isSafeDataUrl(storedReference) || isExternalHttpsUrl(storedReference)) {
    return storedReference
  }

  throw new Error('Belge bağlantısı güvenli değil veya desteklenmiyor.')
}

export async function persistWithOrganizationDocument<T>(
  supabase: SupabaseClient,
  input: UploadOrganizationDocumentInput | null,
  existingReference: string | null,
  persist: (storedReference: string | null) => Promise<T>,
): Promise<T> {
  const uploadedReference = input ? await uploadOrganizationDocument(supabase, input) : null

  try {
    return await persist(uploadedReference ?? existingReference)
  } catch (error) {
    if (uploadedReference) {
      try {
        await removeOrganizationDocument(supabase, uploadedReference)
      } catch (cleanupError) {
        devError('Yeni yüklenen belge temizlenemedi.', cleanupError)
      }
    }

    throw error
  }
}
