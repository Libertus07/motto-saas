"use server"

import { createServerSupabase } from './supabase-server'
import { devError } from '@/lib/debug';
import { headers } from 'next/headers'

export type LogAction = 'EKLEME' | 'SILME' | 'GUNCELLEME'

export async function logActivity(
    moduleName: string,
    actionType: LogAction,
    description: string,
    details?: any
) {
    try {
        const supabase = await createServerSupabase()
        const { data: { user } } = await supabase.auth.getUser()

        const headersList = await headers();
        const ipAddress = headersList.get('x-forwarded-for') || 'Bilinmeyen IP'
        const browserInfo = headersList.get('user-agent') || 'Bilinmeyen Cihaz'

        // Sadece serileştirilebilir verileri tutarak güvenli hale getirelim
        let safeDetails = {};
        try {
            if (details) safeDetails = JSON.parse(JSON.stringify(details));
        } catch (e) {
            safeDetails = { error: 'Detaylar dönüştürülemedi' };
        }

        const enrichedDetails = {
            ...safeDetails,
            _meta: {
                ip: ipAddress,
                userAgent: browserInfo
            }
        }

        const { error } = await supabase.from('activity_logs').insert({
            module: moduleName,
            action_type: actionType,
            description,
            user_id: user?.id || 'Bilinmeyen Kullanıcı',
            details: enrichedDetails
        })
        
        if (error) {
            devError('Loglama tablosuna eklenemedi:', JSON.stringify(error, null, 2))
        }
    } catch (error: any) {
        devError('Loglama kritik hatası:', error?.message || error)
    }
}
