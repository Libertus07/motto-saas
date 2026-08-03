import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { devError } from '@/lib/debug'

export async function POST(req: Request) {
  try {
    const { user, supabase } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    const body = await req.json()
    const { batch_id, organization_id } = body

    if (!batch_id) {
      return NextResponse.json({ error: 'Batch ID gerekli' }, { status: 400 })
    }

    let targetOrgId = organization_id
    if (!targetOrgId) {
      const { data: memberOrg } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .single()
      targetOrgId = memberOrg?.organization_id || null
    }

    if (!targetOrgId) {
      return NextResponse.json({ error: 'Aktif organizasyon kimliği bulunamadı' }, { status: 400 })
    }

    const { error: rpcError } = await supabase.rpc('delete_receipt_transaction', {
      p_batch_id: batch_id,
      p_organization_id: targetOrgId,
    })
    if (rpcError) throw rpcError

    const userAgent = req.headers.get('user-agent') || 'Bilinmeyen Cihaz'
    const ipAddress = req.headers.get('x-forwarded-for') || 'Bilinmeyen IP'

    await supabase.from('activity_logs').insert({
      module: 'Fişler',
      action_type: 'SILME',
      description: 'Tedarikçi fişi silindi ve stok/cari işlemler geri alındı.',
      user_id: user.id,
      organization_id: targetOrgId,
      details: {
        batch_id,
        _meta: { ip: ipAddress, userAgent },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    devError('Delete Receipt Error:', error)
    const message = error instanceof Error ? error.message : 'Silme işlemi başarısız'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
