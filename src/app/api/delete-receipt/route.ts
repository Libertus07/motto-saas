import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { devLog, devError } from '@/lib/debug';

export async function POST(req: Request) {
    try {
        const { user, supabase } = await requireUser()
        if (!user) {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
        }

        const body = await req.json()
        const { batch_id } = body

        if (!batch_id) {
            return NextResponse.json({ error: 'Batch ID gerekli' }, { status: 400 })
        }

        const { error: rpcError } = await supabase.rpc('delete_receipt_transaction', { p_batch_id: batch_id })
        
        if (rpcError) throw rpcError

        const userAgent = req.headers.get('user-agent') || 'Bilinmeyen Cihaz'
        const ipAddress = req.headers.get('x-forwarded-for') || 'Bilinmeyen IP'
        
        await supabase.from('activity_logs').insert({
            module: 'Fişler',
            action_type: 'SILME',
            description: 'Tedarikçi fişi silindi ve stok/cari işlemler geri alındı.',
            user_id: user.id,
            details: {
                batch_id,
                _meta: { ip: ipAddress, userAgent }
            }
        })

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        devError('Delete Receipt Error:', error)
        const message = error instanceof Error ? error.message : 'Silme işlemi başarısız'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
