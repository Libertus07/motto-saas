import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase-server'

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

        // 1. Bu batch_id'ye ait stok çıkışlarını (Z-Raporu düşümleri) bul
        const { data: movements, error: movErr } = await supabase
            .from('stock_movements')
            .select('id, material_id, quantity')
            .eq('batch_id', batch_id)

        if (movErr) throw movErr

        // 2. Stokları geri ekle
        if (movements && movements.length > 0) {
            // Material'ları bul
            const matIds = movements.map(m => m.material_id)
            const { data: materials } = await supabase
                .from('materials')
                .select('id, stock_quantity')
                .in('id', matIds)

            if (materials) {
                // Toplu stok hesaplaması
                const stockUpdates: Record<string, number> = {}
                materials.forEach(m => stockUpdates[m.id] = m.stock_quantity || 0)
                
                movements.forEach(m => {
                    if (stockUpdates[m.material_id] !== undefined) {
                        stockUpdates[m.material_id] += m.quantity // Z-Raporunda çıkış yapıldığı için geri EKLIYORUZ
                    }
                })

                // Güncelle
                for (const matId of Object.keys(stockUpdates)) {
                    await supabase.from('materials').update({ stock_quantity: stockUpdates[matId] }).eq('id', matId)
                }
            }

            // 3. Stok hareketlerini sil
            await supabase.from('stock_movements').delete().eq('batch_id', batch_id)
        }

        // 4. Satışları sil
        const { error: salesErr } = await supabase.from('sales').delete().eq('batch_id', batch_id)
        if (salesErr) throw salesErr

        // 5. Giderleri sil
        await supabase.from('expenses').delete().eq('batch_id', batch_id)

        // 6. Finans (Kasa/Banka) Hareketlerini Geri Al ve Sil
        const { data: accMovs } = await supabase
            .from('account_movements')
            .select('*')
            .eq('source_type', 'z_report')
            .eq('source_id', batch_id)

        if (accMovs && accMovs.length > 0) {
            for (const oldM of accMovs) {
                const { data: currAcc } = await supabase.from('accounts').select('balance').eq('id', oldM.account_id).single()
                if (currAcc) {
                    const reversedBalance = oldM.movement_type === 'giris'
                        ? Number(currAcc.balance) - Number(oldM.amount)
                        : Number(currAcc.balance) + Number(oldM.amount)
                    await supabase.from('accounts').update({ balance: reversedBalance }).eq('id', oldM.account_id)
                }
            }
            // Hareketleri sil
            await supabase.from('account_movements').delete().eq('source_type', 'z_report').eq('source_id', batch_id)
        }

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        console.error('Delete Z-Report Error:', error)
        const message = error instanceof Error ? error.message : 'Silme işlemi başarısız'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
