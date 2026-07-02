import { createClient } from './supabase'

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
            console.error("IP alinmadi")
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
            user_id: user?.email || 'Bilinmeyen Kullanıcı',
            details: enrichedDetails
        })
        
        if (error) {
            console.error('Loglama tablosuna eklenemedi:', error)
        }
    } catch (error) {
        console.error('Loglama kritik hatası:', error)
    }
}
