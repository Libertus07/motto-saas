'use server'

import { createServerSupabase } from './supabase-server'
import { devError } from '@/lib/debug'
import { headers } from 'next/headers'

export type LogAction = 'EKLEME' | 'SILME' | 'GUNCELLEME'

export async function logActivity(
  moduleName: string,
  actionType: LogAction,
  description: string,
  details?: Record<string, unknown> | unknown,
) {
  try {
    const supabase = await createServerSupabase()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      devError('İşlem geçmişi kaydı için oturum bilgisi bulunamadı.')
      return
    }

    const { data: organizationId, error: organizationError } = await supabase.rpc('current_organization_id')

    if (organizationError || !organizationId) {
      devError('İşlem geçmişi kaydı için aktif organizasyon çözümlenemedi.', organizationError)
      return
    }

    const headersList = await headers()
    const ipAddress = headersList.get('x-forwarded-for') || 'Bilinmeyen IP'
    const browserInfo = headersList.get('user-agent') || 'Bilinmeyen Cihaz'

    // Sadece serileştirilebilir verileri tutarak güvenli hale getirelim
    let safeDetails = {}
    try {
      if (details) safeDetails = JSON.parse(JSON.stringify(details))
    } catch {
      safeDetails = { error: 'Detaylar dönüştürülemedi' }
    }

    const enrichedDetails = {
      ...safeDetails,
      _meta: {
        ip: ipAddress,
        userAgent: browserInfo,
      },
    }

    const logPayload: Record<string, unknown> = {
      module: moduleName,
      action_type: actionType,
      description,
      user_id: user.id,
      organization_id: organizationId,
      details: enrichedDetails,
    }

    const { error } = await supabase.from('activity_logs').insert(logPayload)

    if (error) {
      devError('Loglama tablosuna eklenemedi:', JSON.stringify(error, null, 2))
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    devError('Loglama kritik hatası:', msg)
  }
}
