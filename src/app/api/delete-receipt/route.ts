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

        // 1. Bu batch_id'ye ait stok girişlerini bul
        const { data: movements, error: movErr } = await supabase
            .from('stock_movements')
            .select('id, material_id, quantity')
            .eq('batch_id', batch_id)

        if (movErr) throw movErr

        // 2. Stokları geri düş
        if (movements && movements.length > 0) {
            const matIds = movements.map(m => m.material_id)
            const { data: materials } = await supabase
                .from('materials')
                .select('id, stock_quantity')
                .in('id', matIds)

            if (materials) {
                const stockUpdates: Record<string, number> = {}
                materials.forEach(m => stockUpdates[m.id] = m.stock_quantity || 0)
                
                movements.forEach(m => {
                    if (stockUpdates[m.material_id] !== undefined) {
                        // Fiş yüklendiğinde stok girdi, şimdi sildiğimiz için ÇIKARTIYORUZ (0'dan aşağı inmesin)
                        stockUpdates[m.material_id] = Math.max(0, stockUpdates[m.material_id] - m.quantity) 
                    }
                })

                for (const matId of Object.keys(stockUpdates)) {
                    await supabase.from('materials').update({ stock_quantity: stockUpdates[matId] }).eq('id', matId)
                }
            }

            // 3. Stok hareketlerini sil
            await supabase.from('stock_movements').delete().eq('batch_id', batch_id)
        }

        // 4. Cari İşlemleri (Borç/Ödeme) Bul ve Tedarikçi Bakiyesini Düzelt
        const { data: transactions, error: txErr } = await supabase
            .from('supplier_transactions')
            .select('id, supplier_id, amount, transaction_type')
            .eq('batch_id', batch_id)

        if (txErr) throw txErr

        if (transactions && transactions.length > 0) {
            // Tedarikçiye göre net bakiye değişimini hesapla (genelde tek bir tedarikçi olur ama yine de gruplayalım)
            const debtChanges: Record<string, number> = {}
            
            transactions.forEach(tx => {
                if (!debtChanges[tx.supplier_id]) debtChanges[tx.supplier_id] = 0
                
                // Fiş eklenirken: invoice (+ borç yazar), payment (- borç düşer)
                // Şimdi Geri Alıyoruz: invoice iptali (- borç düşer), payment iptali (+ borç yazar)
                if (tx.transaction_type === 'invoice') {
                    debtChanges[tx.supplier_id] -= tx.amount
                } else if (tx.transaction_type === 'payment') {
                    debtChanges[tx.supplier_id] += tx.amount
                }
            })

            // Tedarikçi bakiyelerini güncelle
            const supplierIds = Object.keys(debtChanges)
            if (supplierIds.length > 0) {
                const { data: suppliers } = await supabase
                    .from('suppliers')
                    .select('id, total_debt')
                    .in('id', supplierIds)

                if (suppliers) {
                    for (const sup of suppliers) {
                        const newTotal = parseFloat(sup.total_debt || 0) + debtChanges[sup.id]
                        await supabase.from('suppliers').update({ total_debt: newTotal }).eq('id', sup.id)
                    }
                }
            }

            // İşlemleri sil
            await supabase.from('supplier_transactions').delete().eq('batch_id', batch_id)
        }

        return NextResponse.json({ success: true })
    } catch (error: unknown) {
        console.error('Delete Receipt Error:', error)
        const message = error instanceof Error ? error.message : 'Silme işlemi başarısız'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
