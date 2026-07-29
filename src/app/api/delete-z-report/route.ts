import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'
import { devLog, devError } from '@/lib/debug'

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

    // 1. Z-Raporunu Atomik Olarak Sil (RPC veya Resilient Fallback)
    let rpcSuccess = false
    
    // A. 2-Param RPC Dene
    const { error: rpcErr1 } = await supabase.rpc('delete_z_report_transaction', {
      p_batch_id: batch_id,
      p_organization_id: targetOrgId
    })
    if (!rpcErr1) {
      rpcSuccess = true
    } else {
      devError('RPC (2-param) warning:', rpcErr1)
      // B. (p_batch_id, p_user_id) RPC Dene
      const { error: rpcErr2 } = await supabase.rpc('delete_z_report_transaction', {
        p_batch_id: batch_id,
        p_user_id: user.id
      })
      if (!rpcErr2) {
        rpcSuccess = true
      } else {
        devError('RPC (p_user_id) warning:', rpcErr2)
        // C. 1-Param RPC Dene
        const { error: rpcErr3 } = await supabase.rpc('delete_z_report_transaction', {
          p_batch_id: batch_id
        })
        if (!rpcErr3) {
          rpcSuccess = true
        } else {
          devError('RPC (1-param) warning:', rpcErr3)
        }
      }
    }

    // C. Graceful Fallback: RPC schema cache'de yoksa doğrudan DB sorguları ile rollback yap
    if (!rpcSuccess) {
      devLog('RPC not found in schema cache. Executing resilient fallback DB cleanup...')
      
      // i. Stokları geri yükle
      const { data: stockMovs } = await supabase
        .from('stock_movements')
        .select('material_id, quantity')
        .eq('batch_id', batch_id)

      if (stockMovs && stockMovs.length > 0) {
        for (const mov of stockMovs) {
          if (mov.material_id && mov.quantity) {
            const { data: mat } = await supabase
              .from('materials')
              .select('stock_quantity')
              .eq('id', mov.material_id)
              .single()
            
            const currentQty = Number(mat?.stock_quantity) || 0
            await supabase
              .from('materials')
              .update({ stock_quantity: currentQty + Number(mov.quantity) })
              .eq('id', mov.material_id)
          }
        }
      }

      // ii. Stok hareketlerini, satışları ve giderleri sil
      await supabase.from('stock_movements').delete().eq('batch_id', batch_id)
      await supabase.from('sales').delete().eq('batch_id', batch_id)
      await supabase.from('expenses').delete().eq('batch_id', batch_id)

      // iii. Kasa hareketlerini rollback yap ve sil
      const { data: accMovs } = await supabase
        .from('account_movements')
        .select('account_id, amount, movement_type')
        .eq('source_type', 'z_report')
        .eq('source_id', String(batch_id))

      if (accMovs && accMovs.length > 0) {
        for (const accMov of accMovs) {
          if (accMov.account_id && accMov.amount) {
            const { data: acc } = await supabase
              .from('accounts')
              .select('balance')
              .eq('id', accMov.account_id)
              .single()

            const currentBalance = Number(acc?.balance) || 0
            const change = Number(accMov.amount)
            const newBalance = accMov.movement_type === 'giris'
              ? currentBalance - change
              : currentBalance + change

            await supabase
              .from('accounts')
              .update({ balance: newBalance })
              .eq('id', accMov.account_id)
          }
        }
      }

      await supabase
        .from('account_movements')
        .delete()
        .eq('source_type', 'z_report')
        .eq('source_id', String(batch_id))
    }

    // 2. Audit Log Ekle
    const userAgent = req.headers.get('user-agent') || 'Bilinmeyen Cihaz'
    const ipAddress = req.headers.get('x-forwarded-for') || 'Bilinmeyen IP'

    await supabase.from('activity_logs').insert({
      module: 'Z-Raporu',
      action_type: 'SILME',
      description: 'Z-Raporu kaydı silindi ve stok/finans rollback yapıldı.',
      user_id: user.id,
      organization_id: targetOrgId,
      details: {
        batch_id,
        _meta: { ip: ipAddress, userAgent }
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    devError('Delete Z-Report Error:', error)
    const message = error instanceof Error ? error.message : 'Silme işlemi başarısız'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
