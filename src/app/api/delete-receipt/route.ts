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

        // 1. Fişi Atomik Olarak Sil (RPC veya Resilient Fallback)
        let rpcSuccess = false

        const { error: rpcErr1 } = await supabase.rpc('delete_receipt_transaction', { 
            p_batch_id: batch_id,
            p_organization_id: targetOrgId
        })
        if (!rpcErr1) {
            rpcSuccess = true
        } else {
            devError('Receipt RPC (2-param) warning:', rpcErr1)
            const { error: rpcErr2 } = await supabase.rpc('delete_receipt_transaction', { 
                p_batch_id: batch_id,
                p_user_id: user.id
            })
            if (!rpcErr2) {
                rpcSuccess = true
            } else {
                devError('Receipt RPC (p_user_id) warning:', rpcErr2)
                const { error: rpcErr3 } = await supabase.rpc('delete_receipt_transaction', { 
                    p_batch_id: batch_id
                })
                if (!rpcErr3) {
                    rpcSuccess = true
                } else {
                    devError('Receipt RPC (1-param) warning:', rpcErr3)
                }
            }
        }

        if (!rpcSuccess) {
            devLog('Receipt RPC not found in schema cache. Executing resilient fallback DB cleanup...')
            
            // i. Stokları geri düşür (Fiş eklendiğinde artmıştı)
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
                        const newQty = Math.max(0, currentQty - Number(mov.quantity))
                        await supabase
                            .from('materials')
                            .update({ stock_quantity: newQty })
                            .eq('id', mov.material_id)
                    }
                }
            }

            await supabase.from('stock_movements').delete().eq('batch_id', batch_id)

            // ii. Tedarikçi işlemlerini geri al
            const { data: supTxs } = await supabase
                .from('supplier_transactions')
                .select('supplier_id, amount, transaction_type')
                .eq('batch_id', batch_id)

            if (supTxs && supTxs.length > 0) {
                for (const tx of supTxs) {
                    if (tx.supplier_id && tx.amount) {
                        const { data: sup } = await supabase
                            .from('suppliers')
                            .select('total_debt')
                            .eq('id', tx.supplier_id)
                            .single()

                        const currentDebt = Number(sup?.total_debt) || 0
                        const change = Number(tx.amount)
                        const newDebt = tx.transaction_type === 'invoice'
                            ? currentDebt - change
                            : currentDebt + change

                        await supabase
                            .from('suppliers')
                            .update({ total_debt: newDebt })
                            .eq('id', tx.supplier_id)
                    }
                }
            }

            await supabase.from('supplier_transactions').delete().eq('batch_id', batch_id)
            await supabase.from('account_movements').delete().eq('source_id', String(batch_id))
        }

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
