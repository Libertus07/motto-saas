import { createClient } from './supabase'
import { devLog, devError } from '@/lib/debug';

export type LogAction = 'EKLEME' | 'SILME' | 'GUNCELLEME'

export async function logActivity(
    moduleName: string,
    actionType: LogAction,
    description: string,
    details?: any
) {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        let browserInfo = 'Bilinmeyen Cihaz'
        if (typeof window !== 'undefined') {
            browserInfo = window.navigator.userAgent
        }

        let ipAddress = 'Bilinmeyen IP'
        try {
            const res = await fetch('https://api.ipify.org?format=json')
            const data = await res.json()
            ipAddress = data.ip
        } catch (e) {
            devError("IP alinmadi")
        }

        const enrichedDetails = {
            ...(details || {}),
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
