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

        // 1. Z-Raporunu Atomik Olarak Sil
        const { data, error } = await supabase.rpc('delete_z_report_transaction', {
            p_batch_id: batch_id,
            p_user_id: user.id
        })

        if (error) {
            devError('Delete Z-Report RPC Error:', error)
            throw new Error(error.message || 'Atomic silme işlemi başarısız.')
        }

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        devError('Delete Z-Report Error:', error)
        const message = error instanceof Error ? error.message : 'Silme işlemi başarısız'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
