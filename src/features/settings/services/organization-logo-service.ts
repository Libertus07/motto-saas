import type { SupabaseClient } from '@supabase/supabase-js'

export const ORGANIZATION_BRANDING_BUCKET = 'organization-branding'
export const ORGANIZATION_LOGO_MAX_BYTES = 2 * 1024 * 1024

const ALLOWED_LOGO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function validateOrganizationLogo(file: Pick<File, 'size' | 'type'>): string | null {
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return 'Logo PNG, JPG veya WebP formatında olmalıdır.'
  }
  if (file.size > ORGANIZATION_LOGO_MAX_BYTES) {
    return 'Logo dosyası 2 MB boyutunu aşamaz.'
  }
  return null
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

export async function uploadOrganizationLogo(
  supabase: SupabaseClient,
  organizationId: string,
  file: File,
): Promise<{ objectPath: string; publicUrl: string }> {
  const objectPath = `${organizationId}/${crypto.randomUUID()}.${extensionForMimeType(file.type)}`
  const { error } = await supabase.storage.from(ORGANIZATION_BRANDING_BUCKET).upload(objectPath, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false,
  })
  if (error) throw new Error('Logo dosyası güvenli depolama alanına yüklenemedi.')

  const { data } = supabase.storage.from(ORGANIZATION_BRANDING_BUCKET).getPublicUrl(objectPath)
  return { objectPath, publicUrl: data.publicUrl }
}

export async function removeOrganizationLogo(supabase: SupabaseClient, objectPath: string) {
  await supabase.storage.from(ORGANIZATION_BRANDING_BUCKET).remove([objectPath])
}

export function getManagedLogoObjectPath(url: string, organizationId: string): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const marker = `/storage/v1/object/public/${ORGANIZATION_BRANDING_BUCKET}/`
    const markerIndex = parsed.pathname.indexOf(marker)
    if (markerIndex === -1) return null
    const objectPath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length))
    return objectPath.startsWith(`${organizationId}/`) ? objectPath : null
  } catch {
    return null
  }
}
