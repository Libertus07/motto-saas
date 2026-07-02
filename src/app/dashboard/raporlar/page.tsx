'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useNotification } from '@/components/NotificationProvider'

type Product = {
    id: string
    name: string
    category: string
    sale_price: number
    calculated_cost: number
}

type Expense = {
    amount: number
    period: string
    category: string
    expense_date: string
}

export default function Raporlar() {
    const { showAlert } = useNotification()
    const [products, setProducts] = useState<Product[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [sales, setSales] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    const [targetMargin, setTargetMargin] = useState(35)
    const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({
        kira: 'Kira', personel: 'Personel', elektrik: 'Elektrik', su: 'Su',
        dogalgaz: 'Doğalgaz', internet: 'İnternet', muhasebe: 'Muhasebe',
        sigorta: 'Sigorta', pazarlama: 'Pazarlama', diger: 'Diğer'
    })

    // AI States
    const [aiLoading, setAiLoading] = useState(false)
    const [aiModalOpen, setAiModalOpen] = useState(false)
    const [aiReport, setAiReport] = useState<{ summary: string; recommendations: any[] } | null>(null)

    const supabase = createClient()
    const router = useRouter()

    useEffect(() => { fetchData() }, [])

    const fetchData = async () => {
        const [{ data: prods }, { data: exps }, { data: salesData }, { data: settings }] = await Promise.all([
            supabase.from('products').select('*'),
            supabase.from('expenses').select('amount, period, category, expense_date'),
            supabase.from('sales').select('product_id, quantity, total_price'),
            supabase.from('settings').select('*')
        ])
        setProducts(prods || [])
        setExpenses(exps || [])
        setSales(salesData || [])

        if (settings) {
            const marginSetting = settings.find(s => s.key === 'target_margin')?.value
            if (marginSetting) setTargetMargin(Number(marginSetting))

            const expenseCatSetting = settings.find(s => s.key === 'expense_categories')?.value
            if (expenseCatSetting) setCategoryLabels(typeof expenseCatSetting === 'string' ? JSON.parse(expenseCatSetting) : expenseCatSetting)
        }

        setLoading(false)
    }



    const handleAiAnalyze = async () => {
        setAiLoading(true)
        setAiModalOpen(true)
        setAiReport(null)
        try {
            const response = await fetch('/api/ai-menu-engineer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products })
            })
            const data = await response.json()
            if (!data.error) {
                setAiReport(data)
            } else {
                await showAlert(data.error, 'error')
                setAiModalOpen(false)
            }
        } catch (e) {
            console.error(e)
            await showAlert('Yapay zeka ile bağlantı kurulamadı.', 'error')
            setAiModalOpen(false)
        }
        setAiLoading(false)
    }

    // Hesaplamalar
    const monthlyExpenses = expenses.reduce((t, e) =>
        t + (e.period === 'yearly' ? e.amount / 12 : e.amount), 0)

    const productsWithMargin = products
        .filter(p => p.sale_price > 0)
        .map(p => ({
            ...p,
            margin: ((p.sale_price - (p.calculated_cost || 0)) / p.sale_price) * 100,
            profit: p.sale_price - (p.calculated_cost || 0)
        }))

    const productSalesStats = sales.reduce((acc, sale) => {
        if (!acc[sale.product_id]) acc[sale.product_id] = { revenue: 0, quantity: 0 }
        acc[sale.product_id].revenue += Number(sale.total_price) || 0
        acc[sale.product_id].quantity += sale.quantity || 0
        return acc
    }, {} as Record<string, { revenue: number, quantity: number }>)

    const productsWithStats = productsWithMargin.map(p => ({
        ...p,
        totalRevenue: productSalesStats[p.id]?.revenue || 0,
        totalQuantity: productSalesStats[p.id]?.quantity || 0,
        totalProfit: (productSalesStats[p.id]?.quantity || 0) * p.profit
    }))

    const topByRevenue = [...productsWithStats].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5)
    const topByTotalProfit = [...productsWithStats].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 5)

    const avgMargin = productsWithMargin.length > 0
        ? productsWithMargin.reduce((t, p) => t + p.margin, 0) / productsWithMargin.length
        : 0

    // Kategori bazlı
    const categoryStats = products.reduce((acc, p) => {
        if (!acc[p.category]) acc[p.category] = { count: 0, avgCost: 0, totalCost: 0 }
        acc[p.category].count++
        acc[p.category].totalCost += p.calculated_cost || 0
        return acc
    }, {} as Record<string, { count: number; avgCost: number; totalCost: number }>)

    Object.keys(categoryStats).forEach(cat => {
        categoryStats[cat].avgCost = categoryStats[cat].totalCost / categoryStats[cat].count
    })

    // Gider kategorisi dağılımı
    const expenseCategories = expenses.reduce((acc, e) => {
        const monthlyAmount = e.period === 'yearly' ? e.amount / 12 : e.amount
        acc[e.category] = (acc[e.category] || 0) + monthlyAmount
        return acc
    }, {} as Record<string, number>)

    const getMarginColor = (margin: number) => {
        if (margin >= targetMargin + 20) return 'text-green-400'
        if (margin >= targetMargin) return 'text-yellow-400'
        return 'text-red-400'
    }

    return (
        <div className="min-h-full bg-stone-950 text-white">

            {/* Header */}
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">📊</span>
                    <h1 className="font-bold text-amber-400">Raporlar</h1>
                </div>
                <button 
                    onClick={handleAiAnalyze}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                    <span>🧠</span> Yapay Zeka Asistanı
                </button>
            </header>

            <main className="p-6">
                {loading ? <p className="text-stone-400">Yükleniyor...</p> : (
                    <div className="space-y-6">

                        {/* Akıllı Veri Girişi & Fiş Arşivi */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Üst Satır - Yüklemeler */}
                            <div 
                                onClick={() => router.push('/dashboard/hammaddeler/fis-yukle')}
                                className="bg-stone-900 border border-stone-800 hover:border-amber-500/50 rounded-xl p-5 cursor-pointer transition-all hover:bg-stone-800 flex items-center gap-4"
                            >
                                <div className="text-4xl">🧾</div>
                                <div>
                                    <h3 className="font-bold text-amber-400 text-lg">Hammadde Faturası Yükle</h3>
                                    <p className="text-stone-400 text-sm">Yapay zeka ile tedarikçi fişlerinden fiyat ve stokları otomatik güncelle.</p>
                                </div>
                            </div>
                            <div 
                                onClick={() => router.push('/dashboard/raporlar/z-raporu')}
                                className="bg-stone-900 border border-stone-800 hover:border-blue-500/50 rounded-xl p-5 cursor-pointer transition-all hover:bg-stone-800 flex items-center gap-4"
                            >
                                <div className="text-4xl">📸</div>
                                <div>
                                    <h3 className="font-bold text-blue-400 text-lg">Gün Sonu Z Raporu Yükle</h3>
                                    <p className="text-stone-400 text-sm">Z raporunun fotoğrafını çek, gün sonu satışlarını ve stok düşümlerini otomatik yap.</p>
                                </div>
                            </div>
                            <div 
                                onClick={() => router.push('/dashboard/raporlar/yatirim-fisi')}
                                className="bg-stone-900 border border-stone-800 hover:border-purple-500/50 rounded-xl p-5 cursor-pointer transition-all hover:bg-stone-800 flex items-center gap-4"
                            >
                                <div className="text-4xl">💰</div>
                                <div>
                                    <h3 className="font-bold text-purple-400 text-lg">Yatırım Fişi Yükle</h3>
                                    <p className="text-stone-400 text-sm">Altın, döviz veya varlık fişlerinizi okutarak portföyünüze ekleyin.</p>
                                </div>
                            </div>

                            {/* Alt Satır - Arşivler */}
                            <div 
                                onClick={() => router.push('/dashboard/raporlar/tedarikci-gecmisi')}
                                className="bg-stone-900 border border-stone-800 hover:border-amber-500/50 rounded-xl p-5 cursor-pointer transition-all hover:bg-stone-800 flex items-center gap-4"
                            >
                                <div className="text-4xl">📂</div>
                                <div>
                                    <h3 className="font-bold text-amber-400 text-lg">Geçmiş Fişler</h3>
                                    <p className="text-stone-400 text-sm">Geçmiş tedarikçi ve hammadde faturalarını incele.</p>
                                </div>
                            </div>
                            <div 
                                onClick={() => router.push('/dashboard/raporlar/gecmis')}
                                className="bg-stone-900 border border-stone-800 hover:border-blue-500/50 rounded-xl p-5 cursor-pointer transition-all hover:bg-stone-800 flex items-center gap-4"
                            >
                                <div className="text-4xl">📅</div>
                                <div>
                                    <h3 className="font-bold text-blue-400 text-lg">Geçmiş Z Raporları</h3>
                                    <p className="text-stone-400 text-sm">Daha önce işlenen gün sonu satış raporlarını gör.</p>
                                </div>
                            </div>
                            <div 
                                onClick={() => router.push('/dashboard/raporlar/yatirim-gecmisi')}
                                className="bg-stone-900 border border-stone-800 hover:border-purple-500/50 rounded-xl p-5 cursor-pointer transition-all hover:bg-stone-800 flex items-center gap-4"
                            >
                                <div className="text-4xl">🗂️</div>
                                <div>
                                    <h3 className="font-bold text-purple-400 text-lg">Geçmiş Yatırım Fişleri</h3>
                                    <p className="text-stone-400 text-sm">Yüklediğiniz tüm yatırım ve dekont arşivine göz atın.</p>
                                </div>
                            </div>
                        </div>



                        {/* Genel Özet */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
                                <p className="text-stone-400 text-xs mb-1">Toplam Ürün</p>
                                <p className="text-2xl font-bold text-white">{products.length}</p>
                            </div>
                            <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
                                <p className="text-stone-400 text-xs mb-1">Ortalama Kar Marjı</p>
                                <p className={`text-2xl font-bold ${getMarginColor(avgMargin)}`}>%{avgMargin.toFixed(1)}</p>
                            </div>
                            <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
                                <p className="text-stone-400 text-xs mb-1">Aylık Gider</p>
                                <p className="text-2xl font-bold text-amber-400">
                                    ₺{monthlyExpenses.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                                </p>
                            </div>
                            <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
                                <p className="text-stone-400 text-xs mb-1">Düşük Marjlı Ürün</p>
                                <p className="text-2xl font-bold text-red-400">
                                    {productsWithMargin.filter(p => p.margin < targetMargin).length}
                                </p>
                            </div>
                        </div>

                        {/* En Çok Satan / En Karlı Ürünler */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                                <h3 className="font-bold mb-4 text-blue-400">🔥 Ciro Şampiyonları (En Çok Para Getirenler)</h3>
                                {topByRevenue.length === 0 || topByRevenue[0].totalRevenue === 0 ? (
                                    <p className="text-stone-500 text-sm">Veri yok</p>
                                ) : (
                                    <div className="space-y-3">
                                        {topByRevenue.map(p => (
                                            <div key={p.id} className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-medium text-sm">{p.name}</p>
                                                    <p className="text-stone-500 text-xs">{p.totalQuantity} adet satıldı</p>
                                                </div>
                                                <span className="text-blue-400 font-bold">₺{p.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                                <h3 className="font-bold mb-4 text-green-400">💰 Kâr Şampiyonları (En Çok Kâr Bırakanlar)</h3>
                                {topByTotalProfit.length === 0 || topByTotalProfit[0].totalProfit === 0 ? (
                                    <p className="text-stone-500 text-sm">Veri yok</p>
                                ) : (
                                    <div className="space-y-3">
                                        {topByTotalProfit.map(p => (
                                            <div key={p.id} className="flex items-center justify-between">
                                                <div>
                                                    <p className="font-medium text-sm">{p.name}</p>
                                                    <p className="text-stone-500 text-xs">Marj: %{p.margin.toFixed(1)}</p>
                                                </div>
                                                <span className="text-green-400 font-bold">₺{p.totalProfit.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Kategori Bazlı Maliyet */}
                        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                            <h3 className="font-bold mb-4 text-stone-300">📦 Kategori Bazlı Ortalama Maliyet</h3>
                            {Object.keys(categoryStats).length === 0 ? (
                                <p className="text-stone-500 text-sm">Veri yok</p>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(categoryStats).map(([cat, stat]) => (
                                        <div key={cat} className="flex items-center gap-3">
                                            <span className="text-stone-400 text-sm w-32">{cat}</span>
                                            <span className="text-stone-500 text-xs w-16">{stat.count} ürün</span>
                                            <div className="flex-1 bg-stone-800 rounded-full h-2">
                                                <div
                                                    className="bg-amber-400 h-2 rounded-full"
                                                    style={{ width: `${Math.min((stat.avgCost / 50) * 100, 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-amber-400 text-sm w-20 text-right">₺{stat.avgCost.toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Gider Dağılımı */}
                        <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
                            <h3 className="font-bold mb-4 text-stone-300">💰 Gider Kategori Dağılımı (Aylık)</h3>
                            {Object.keys(expenseCategories).length === 0 ? (
                                <p className="text-stone-500 text-sm">Veri yok</p>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(expenseCategories)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([cat, amount]) => (
                                            <div key={cat} className="flex items-center gap-3">
                                                <span className="text-stone-400 text-sm w-24">{categoryLabels[cat] || cat}</span>
                                                <div className="flex-1 bg-stone-800 rounded-full h-2">
                                                    <div
                                                        className="bg-red-400 h-2 rounded-full"
                                                        style={{ width: `${(amount / monthlyExpenses) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-red-400 text-sm w-24 text-right">
                                                    ₺{amount.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                                                </span>
                                                <span className="text-stone-500 text-xs w-10 text-right">
                                                    %{((amount / monthlyExpenses) * 100).toFixed(0)}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        {/* Tüm Ürünler Tablosu */}
                        <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
                            <div className="px-5 py-3 border-b border-stone-800">
                                <h3 className="font-bold text-stone-300">Tüm Ürünler — Detaylı Karlılık</h3>
                            </div>
                            <div className="overflow-x-auto w-full">
<table className="w-full">
                                <thead>
                                    <tr className="border-b border-stone-800">
                                        <th className="text-left px-4 py-3 text-stone-400 text-sm">Ürün</th>
                                        <th className="text-left px-4 py-3 text-stone-400 text-sm">Kategori</th>
                                        <th className="text-right px-4 py-3 text-stone-400 text-sm">Maliyet</th>
                                        <th className="text-right px-4 py-3 text-stone-400 text-sm">Satış Fiyatı</th>
                                        <th className="text-right px-4 py-3 text-stone-400 text-sm">Kar</th>
                                        <th className="text-right px-4 py-3 text-stone-400 text-sm">Marj</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productsWithMargin.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-8 text-stone-500">Henüz ürün eklenmemiş</td></tr>
                                    ) : productsWithMargin
                                        .sort((a, b) => a.margin - b.margin)
                                        .map(p => (
                                            <tr key={p.id} className="border-b border-stone-800 hover:bg-stone-800 transition-colors">
                                                <td className="px-4 py-3 font-medium">{p.name}</td>
                                                <td className="px-4 py-3 text-stone-400 text-sm">{p.category}</td>
                                                <td className="px-4 py-3 text-right text-stone-400">₺{(p.calculated_cost || 0).toFixed(2)}</td>
                                                <td className="px-4 py-3 text-right">₺{p.sale_price.toFixed(2)}</td>
                                                <td className={`px-4 py-3 text-right font-bold ${p.profit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                    ₺{p.profit.toFixed(2)}
                                                </td>
                                                <td className={`px-4 py-3 text-right font-bold ${getMarginColor(p.margin)}`}>
                                                    %{p.margin.toFixed(1)}
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
</div>
                        </div>

                    </div>
                )}
            </main>

            {/* AI Asistan Modalı */}
            {aiModalOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-stone-900 border border-amber-500/30 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">🧠</span>
                                <div>
                                    <h2 className="text-xl font-bold text-amber-400">AI Menü Mühendisi</h2>
                                    <p className="text-stone-400 text-sm">Finansal Analiz ve Strateji Önerileri</p>
                                </div>
                            </div>
                            <button onClick={() => setAiModalOpen(false)} className="text-stone-500 hover:text-white text-xl">✕</button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2">
                            {aiLoading ? (
                                <div className="py-12 text-center space-y-4">
                                    <div className="text-6xl animate-pulse">🤖</div>
                                    <p className="text-stone-400">Menünüz inceleniyor, kar marjları hesaplanıyor...</p>
                                    <p className="text-sm text-stone-500">Bu işlem 10-15 saniye sürebilir.</p>
                                </div>
                            ) : aiReport ? (
                                <div className="space-y-6">
                                    <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
                                        <h3 className="font-bold text-amber-400 mb-2">Genel Durum Özeti</h3>
                                        <p className="text-stone-300 leading-relaxed">{aiReport.summary}</p>
                                    </div>

                                    <div>
                                        <h3 className="font-bold text-white mb-4">Aksiyon Bekleyen Ürünler (Öneriler)</h3>
                                        <div className="space-y-4">
                                            {aiReport.recommendations?.map((rec, i) => (
                                                <div key={i} className="bg-stone-800 rounded-lg p-4 border border-stone-700">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <h4 className="font-bold text-lg text-white">{rec.product_name}</h4>
                                                        <span className="bg-stone-900 text-xs text-stone-400 px-2 py-1 rounded">Öneri #{i + 1}</span>
                                                    </div>
                                                    
                                                    <div className="space-y-3 mt-3">
                                                        <div>
                                                            <span className="text-xs text-red-400 font-bold uppercase tracking-wider block mb-1">Tespit Edilen Sorun</span>
                                                            <p className="text-sm text-stone-300">{rec.issue}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs text-green-400 font-bold uppercase tracking-wider block mb-1">Çözüm Aksiyonu</span>
                                                            <p className="text-sm text-stone-300 bg-green-900/10 p-2 rounded border border-green-900/30">{rec.action}</p>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs text-amber-400 font-bold uppercase tracking-wider block mb-1">Beklenen Etki</span>
                                                            <p className="text-sm text-amber-200">{rec.impact}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-stone-400 text-center py-8">Bir hata oluştu, rapor alınamadı.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}