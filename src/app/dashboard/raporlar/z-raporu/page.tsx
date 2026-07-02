'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'

type Product = {
    id: string
    name: string
    category: string
}

type ParsedSaleItem = {
    product_name: string
    quantity: number
    total_price: number
    matchedProductId?: string
}

type ParsedExpenseItem = {
    expense_name: string
    amount: number
    category?: string
}

export default function ZRaporuYukle() {
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [fileText, setFileText] = useState<string | null>(null)
    const [fileType, setFileType] = useState<'image' | 'pdf' | 'xml' | 'json' | null>(null)
    const [loading, setLoading] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const [parsedData, setParsedData] = useState<{ date: string, total_revenue: number, payment_methods?: { cash: number, credit_card: number, other: number }, items: ParsedSaleItem[], expenses: ParsedExpenseItem[] } | null>(null)
    const [products, setProducts] = useState<Product[]>([])
    const [accounts, setAccounts] = useState<{id: string, name: string, type: string}[]>([])

    // Yeni ürün ekleme modalı
    const [newProductModal, setNewProductModal] = useState<{ isOpen: boolean, itemIndex: number, name: string, price: number, category: string } | null>(null)
    const [savingProduct, setSavingProduct] = useState(false)

    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        const fetchProductsAndAccounts = async () => {
            const { data: prodData } = await supabase.from('products').select('id, name, category')
            setProducts(prodData || [])
            const { data: accData } = await supabase.from('accounts').select('id, name, type')
            setAccounts(accData || [])
        }
        fetchProductsAndAccounts()
    }, [])

    const uniqueCategories = Array.from(new Set(products.map(p => p.category).filter(Boolean)))
    // Default kategoriler eğer sistemde hiç yoksa diye
    const defaultCategories = ['Sıcak İçecek', 'Soğuk İçecek', 'Tatlı', 'Yemek', 'Genel']
    const allCategories = Array.from(new Set([...defaultCategories, ...uniqueCategories]))

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const fileExt = file.name.split('.').pop()?.toLowerCase()
        if (fileExt === 'xml' || fileExt === 'json') {
            const reader = new FileReader()
            reader.onload = () => {
                setImageUrl(null)
                setFileText(reader.result as string)
                setFileType(fileExt as 'xml' | 'json')
            }
            reader.readAsText(file)
        } else {
            const reader = new FileReader()
            reader.onload = () => {
                setFileText(null)
                setImageUrl(reader.result as string)
                setFileType(file.type === 'application/pdf' ? 'pdf' : 'image')
            }
            reader.readAsDataURL(file)
        }
    }

    const handleAnalyze = async () => {
        if (!imageUrl && !fileText) return
        setAnalyzing(true)

        try {
            const res = await fetch('/api/analyze-z-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: imageUrl,
                    fileText: fileText,
                    fileType: fileType,
                    existingProducts: products.map(p => p.name)
                })
            })

            const data = await res.json()
            if (data.error) throw new Error(data.error)

            // Eşleşmeleri otomatik yap
            const mappedItems = data.items.map((item: any) => {
                const match = products.find(p => p.name.toLowerCase() === item.product_name.toLowerCase())
                return { ...item, matchedProductId: match?.id }
            })

            setParsedData({ ...data, items: mappedItems })
        } catch (error: any) {
            alert(error.message)
        } finally {
            setAnalyzing(false)
        }
    }

    const handleCreateProduct = async () => {
        if (!newProductModal || !newProductModal.name || !newProductModal.category) {
            alert('Lütfen ürün adı ve kategorisini girin.')
            return
        }

        setSavingProduct(true)
        try {
            const { data, error } = await supabase.from('products').insert({
                name: newProductModal.name,
                category: newProductModal.category,
                sale_price: newProductModal.price
            }).select('*').single()

            if (error) throw error

            if (data) {
                // 1. Ürünler listesini güncelle
                setProducts(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))

                // 2. Fişteki kalemi bu yeni ürünle eşleştir
                if (parsedData) {
                    const newItems = [...parsedData.items]
                    newItems[newProductModal.itemIndex].matchedProductId = data.id
                    setParsedData({ ...parsedData, items: newItems })
                }

                setNewProductModal(null)
            }
        } catch (err: any) {
            alert('Ürün eklenirken hata oluştu: ' + err.message)
        } finally {
            setSavingProduct(false)
        }
    }

    const startManualMode = () => {
        setParsedData({
            date: new Date().toISOString().split('T')[0],
            total_revenue: 0,
            payment_methods: { cash: 0, credit_card: 0, other: 0 },
            items: [{
                product_name: '',
                quantity: 1,
                total_price: 0,
                matchedProductId: undefined
            }],
            expenses: []
        })
    }

    const addManualExpense = () => {
        if (parsedData) {
            setParsedData({
                ...parsedData,
                expenses: [...(parsedData.expenses || []), {
                    expense_name: '',
                    amount: 0,
                    category: 'Genel'
                }]
            })
        }
    }

    const addManualSale = () => {
        if (parsedData) {
            setParsedData({
                ...parsedData,
                items: [...parsedData.items, {
                    product_name: '',
                    quantity: 1,
                    total_price: 0,
                    matchedProductId: undefined
                }]
            })
        }
    }

    const handleApprove = async () => {
        if (!parsedData) return
        setLoading(true)

        try {
            const reportDate = parsedData.date || new Date().toISOString().split('T')[0]
            const batchId = crypto.randomUUID()

            // 1. Satışları Sales tablosuna kaydet
            const salesInserts = parsedData.items.map(item => ({
                batch_id: batchId,
                sale_date: reportDate,
                product_id: item.matchedProductId || null,
                quantity: item.quantity,
                unit_price: item.quantity > 0 ? Number((item.total_price / item.quantity).toFixed(2)) : 0,
                total_price: item.total_price
            }))

            const { error: salesError } = await supabase.from('sales').insert(salesInserts)
            if (salesError) throw salesError

            // 1.5. Giderleri Expenses tablosuna kaydet
            if (parsedData.expenses && parsedData.expenses.length > 0) {
                const expenseInserts = parsedData.expenses.map(exp => ({
                    batch_id: batchId,
                    name: exp.expense_name,
                    category: exp.category || 'Genel',
                    amount: exp.amount,
                    period: 'Günlük',
                    expense_date: reportDate
                }))
                const { error: expError } = await supabase.from('expenses').insert(expenseInserts)
                if (expError) throw expError
            }

            // 1.8 Finans / Hesaplara Para Giriş - Çıkışları
            if (parsedData.payment_methods) {
                const cashAccount = accounts.find(a => a.type === 'cash')
                const bankAccount = accounts.find(a => a.type === 'bank')
                const accountMovements = []

                if (cashAccount && parsedData.payment_methods.cash > 0) {
                    accountMovements.push({
                        account_id: cashAccount.id,
                        movement_type: 'giris',
                        amount: parsedData.payment_methods.cash,
                        description: `${reportDate} Z-Raporu Nakit Hasılat`,
                        source_type: 'z_report',
                        source_id: batchId
                    })
                }

                if (bankAccount && parsedData.payment_methods.credit_card > 0) {
                    accountMovements.push({
                        account_id: bankAccount.id,
                        movement_type: 'giris',
                        amount: parsedData.payment_methods.credit_card,
                        description: `${reportDate} Z-Raporu Kredi Kartı Hasılat`,
                        source_type: 'z_report',
                        source_id: batchId
                    })
                }

                if (cashAccount && parsedData.expenses && parsedData.expenses.length > 0) {
                    const totalExpense = parsedData.expenses.reduce((acc, exp) => acc + Number(exp.amount), 0)
                    if (totalExpense > 0) {
                        accountMovements.push({
                            account_id: cashAccount.id,
                            movement_type: 'cikis',
                            amount: totalExpense,
                            description: `${reportDate} Z-Raporu Kasadan Giderler`,
                            source_type: 'z_report',
                            source_id: batchId
                        })
                    }
                }

                if (accountMovements.length > 0) {
                    await supabase.from('account_movements').insert(accountMovements)
                    
                    // Hesap bakiyelerini manuel güncelle
                    for (const m of accountMovements) {
                        const { data: currAcc } = await supabase.from('accounts').select('balance').eq('id', m.account_id).single()
                        if (currAcc) {
                            const amountChange = m.movement_type === 'giris' ? Number(m.amount) : -Number(m.amount)
                            await supabase.from('accounts').update({ balance: Number(currAcc.balance) + amountChange }).eq('id', m.account_id)
                        }
                    }
                }
            }

            // 2. Stoktan Düşüm (Sadece eşleşen ürünler için BOM hesapla)
            const matchedSales = parsedData.items.filter(i => i.matchedProductId)
            
            if (matchedSales.length > 0) {
                // Tüm ürün reçetelerini çek
                const { data: prodIngs } = await supabase.from('product_ingredients')
                    .select('*, sub_recipes(*, sub_recipe_ingredients(*))')
                    .in('product_id', matchedSales.map(s => s.matchedProductId))

                const stockDeductions: Record<string, number> = {}

                matchedSales.forEach(sale => {
                    const recipe = prodIngs?.filter(pi => pi.product_id === sale.matchedProductId) || []
                    
                    recipe.forEach(ingredient => {
                        if (ingredient.material_id) {
                            // Direkt hammadde
                            const totalQty = sale.quantity * ingredient.quantity
                            stockDeductions[ingredient.material_id] = (stockDeductions[ingredient.material_id] || 0) + totalQty
                        } else if (ingredient.sub_recipe_id && ingredient.sub_recipes) {
                            // Yarı mamul
                            const subRecipe = ingredient.sub_recipes
                            const subIngredients = subRecipe.sub_recipe_ingredients || []
                            
                            // 1 Porsiyon ürün için gereken hammadde = (Alt reçetedeki toplam hammadde) / (Alt reçete verimi)
                            subIngredients.forEach((subIng: any) => {
                                const qtyPerYield = subIng.quantity / (subRecipe.yield_quantity || 1)
                                const totalQty = sale.quantity * ingredient.quantity * qtyPerYield
                                stockDeductions[subIng.material_id] = (stockDeductions[subIng.material_id] || 0) + totalQty
                            })
                        }
                    })
                })

                // 3. Stok hareketlerini oluştur ve miktarları güncelle
                const movementInserts = Object.entries(stockDeductions).map(([matId, qty]) => ({
                    batch_id: batchId,
                    material_id: matId,
                    movement_type: 'cikis',
                    quantity: qty,
                    note: `Z Raporu Otomatik Düşümü (${reportDate})`
                }))

                if (movementInserts.length > 0) {
                    await supabase.from('stock_movements').insert(movementInserts)

                    // Materials tablosundaki güncel stokları al ve güncelle
                    const { data: currentMats } = await supabase.from('materials').select('id, stock_quantity').in('id', Object.keys(stockDeductions))
                    
                    for (const mat of currentMats || []) {
                        const deduction = stockDeductions[mat.id] || 0
                        const newStock = Math.max(0, (mat.stock_quantity || 0) - deduction)
                        await supabase.from('materials').update({ stock_quantity: newStock }).eq('id', mat.id)
                    }
                }
            }

            logActivity('Z-Raporu', 'EKLEME', `${reportDate} tarihli Z-Raporu sisteme eklendi ve ${matchedSales.length} ürün/hammadde stoğu düşüldü.`, { batchId })
            alert('Z Raporu başarıyla işlendi ve stoklar düşüldü!')
            router.push('/dashboard/raporlar')
        } catch (err: any) {
            alert('Kayıt sırasında hata oluştu: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-full bg-stone-950 text-white">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center gap-3">
                <button onClick={() => router.push('/dashboard/raporlar')} className="text-stone-400 hover:text-white">← Geri</button>
                <span className="text-stone-600">|</span>
                <span className="text-2xl">📸</span>
                <h1 className="font-bold text-blue-400">Gün Sonu Z Raporu Yükle</h1>
            </header>

            <main className="p-6 max-w-4xl mx-auto">
                {!parsedData ? (
                    <div className="space-y-6">
                        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center border-dashed">
                            <div className="text-6xl mb-4">🧾</div>
                            <h2 className="text-xl font-bold mb-2">Belge Yükleyin (Görsel, PDF, XML, JSON)</h2>
                            <p className="text-stone-400 mb-6 max-w-md mx-auto">
                                Z Raporu görseli, PDF, XML veya JSON formatında satış raporunuzu yükleyebilirsiniz. Yapay zeka satışları okuyacak ve stokları düşecek.
                            </p>
                            
                            <label className="block w-full border-2 border-dashed border-stone-700 hover:border-amber-400 rounded-xl p-8 text-center cursor-pointer transition-colors relative bg-stone-900/50">
                                <input
                                    type="file"
                                    accept="image/*,application/pdf,text/xml,.xml,application/json,.json"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                                <div className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-3 rounded-lg transition-colors inline-block">
                                    Belge Seç / Çek
                                </div>
                                <p className="text-stone-600 text-sm mt-3">JPG, PNG, PDF, XML, JSON desteklenir</p>
                            </label>
                            
                            <div className="flex items-center gap-4 my-6">
                                <div className="h-px bg-stone-800 flex-1"></div>
                                <span className="text-stone-500 text-sm font-bold">YAPAY ZEKA İSTEMİYOR MUSUNUZ?</span>
                                <div className="h-px bg-stone-800 flex-1"></div>
                            </div>
                            <button
                                onClick={startManualMode}
                                disabled={analyzing || loading}
                                className="w-full bg-stone-800 hover:bg-stone-700 text-white font-bold py-4 rounded-xl transition-colors border border-stone-700 text-lg"
                            >
                                ✍️ Z Raporunu Manuel Gir
                            </button>
                        </div>

                        {(imageUrl || fileText) && (
                            <div className="bg-stone-900 border border-stone-800 rounded-xl p-6">
                                <h3 className="font-bold mb-4">Önizleme</h3>
                                <div className="flex justify-center mb-6">
                                    {imageUrl && fileType === 'image' && (
                                        <img src={imageUrl} alt="Z Raporu" className="max-h-96 mx-auto rounded-lg object-contain" />
                                    )}
                                    {imageUrl && fileType === 'pdf' && (
                                        <div className="py-12 text-center">
                                            <div className="text-6xl mb-3">📄</div>
                                            <p className="text-stone-300 font-bold">PDF Seçildi</p>
                                        </div>
                                    )}
                                    {fileText && fileType === 'xml' && (
                                        <div className="py-12 text-center">
                                            <div className="text-6xl mb-3">📰</div>
                                            <p className="text-stone-300 font-bold">XML Seçildi</p>
                                        </div>
                                    )}
                                    {fileText && fileType === 'json' && (
                                        <div className="py-12 text-center">
                                            <div className="text-6xl mb-3">🤖</div>
                                            <p className="text-stone-300 font-bold">JSON Seçildi</p>
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={handleAnalyze}
                                    disabled={analyzing}
                                    className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                                >
                                    {analyzing ? 'Yapay Zeka Fişi Okuyor...' : 'Yapay Zeka İle Analiz Et ✨'}
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex-1">
                                <h2 className="font-bold text-green-400 text-xl mb-2">Z Raporu Detayları</h2>
                                <div>
                                    <label className="text-stone-400 text-sm block mb-1">Rapor Tarihi</label>
                                    <input 
                                        type="date"
                                        value={parsedData.date}
                                        onChange={(e) => setParsedData({...parsedData, date: e.target.value})}
                                        className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                    />
                                </div>
                            </div>
                            <div className="text-left md:text-right w-full md:w-auto flex flex-col sm:flex-row gap-4 justify-end flex-wrap mt-4 md:mt-0">
                                <div>
                                    <p className="text-stone-400 text-sm mb-1">Nakit Tahsilat (₺)</p>
                                    <input 
                                        type="number"
                                        value={parsedData.payment_methods?.cash || 0}
                                        onChange={(e) => setParsedData({...parsedData, payment_methods: { ...parsedData.payment_methods, cash: parseFloat(e.target.value) || 0 } as any})}
                                        className="w-24 bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400 font-bold"
                                    />
                                </div>
                                <div>
                                    <p className="text-stone-400 text-sm mb-1">Kart/POS Tahsilat (₺)</p>
                                    <input 
                                        type="number"
                                        value={parsedData.payment_methods?.credit_card || 0}
                                        onChange={(e) => setParsedData({...parsedData, payment_methods: { ...parsedData.payment_methods, credit_card: parseFloat(e.target.value) || 0 } as any})}
                                        className="w-24 bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400 font-bold"
                                    />
                                </div>
                                <div className="border-l border-stone-700/50 pl-4">
                                    <p className="text-stone-400 text-sm mb-1">Toplam Ciro</p>
                                    <div className="text-xl font-bold text-white bg-stone-900 px-4 py-2 rounded-lg border border-stone-800 inline-block">
                                        ₺{parsedData.items.reduce((acc, item) => acc + (Number(item.total_price) || 0), 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-green-400 text-sm mb-1 font-bold">Kalan Net Kasa</p>
                                    <div className="text-2xl font-bold text-green-400 bg-stone-900 px-4 py-2 rounded-lg border border-green-500/30 inline-block">
                                        ₺{((parsedData.payment_methods?.cash || 0) - (parsedData.expenses || []).reduce((acc, exp) => acc + (Number(exp.amount) || 0), 0)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
                            <div className="p-4 border-b border-stone-800 bg-stone-800/50">
                                <h3 className="font-bold text-stone-300">Satış Kalemleri ve Eşleşmeler</h3>
                                <p className="text-sm text-stone-400">Lütfen sistemdeki ürünlerinizle doğru eşleştiğinden emin olun. Eşleşmeyenlerin stoğu düşülemez.</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                    <tr className="border-b border-stone-800">
                                        <th className="text-left px-4 py-3 text-stone-400 text-sm w-[30%]">Fişteki Adı</th>
                                        <th className="text-center px-4 py-3 text-stone-400 text-sm w-[15%]">Satış Adeti</th>
                                        <th className="text-right px-4 py-3 text-stone-400 text-sm w-[20%]">Tutar</th>
                                        <th className="text-left px-4 py-3 text-stone-400 text-sm w-[35%]">Sistemdeki Ürün</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {parsedData.items.map((item, i) => (
                                        <tr key={i} className="border-b border-stone-800 hover:bg-stone-800/50 transition-colors">
                                            <td className="px-4 py-3">
                                                <input 
                                                    value={item.product_name}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const matched = products.find(p => p.name.toLowerCase() === val.toLowerCase());
                                                        const newItems = [...parsedData.items];
                                                        newItems[i].product_name = val;
                                                        newItems[i].matchedProductId = matched?.id;
                                                        setParsedData({ ...parsedData, items: newItems });
                                                    }}
                                                    placeholder="Satılan Ürün Adı"
                                                    className="w-full min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-400"
                                                    list="product-options"
                                                />
                                                <datalist id="product-options">
                                                    {products.map(p => <option key={p.id} value={p.name} />)}
                                                </datalist>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <input 
                                                    type="number"
                                                    value={item.quantity}
                                                    onChange={(e) => {
                                                        const newItems = [...parsedData.items];
                                                        newItems[i].quantity = parseFloat(e.target.value) || 0;
                                                        setParsedData({ ...parsedData, items: newItems });
                                                    }}
                                                    className="w-full min-w-[60px] bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-400 text-center text-amber-400 font-bold"
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <span className="text-stone-400">₺</span>
                                                    <input 
                                                        type="number"
                                                        value={item.total_price}
                                                        onChange={(e) => {
                                                            const newItems = [...parsedData.items];
                                                            newItems[i].total_price = parseFloat(e.target.value) || 0;
                                                            setParsedData({ ...parsedData, items: newItems });
                                                        }}
                                                        className="w-full min-w-[80px] bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-400 text-right"
                                                    />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    <select
                                                        value={item.matchedProductId || ''}
                                                        onChange={e => {
                                                            const newItems = [...parsedData.items]
                                                            newItems[i].matchedProductId = e.target.value
                                                            setParsedData({ ...parsedData, items: newItems })
                                                        }}
                                                        className={`w-full min-w-0 bg-stone-800 border rounded px-2 py-2 text-sm focus:outline-none focus:border-amber-400 ${!item.matchedProductId ? 'border-red-500 text-red-400' : 'border-stone-700 text-green-400'}`}
                                                    >
                                                        <option value="">-- Eşleşmedi --</option>
                                                        {products.map(p => (
                                                            <option key={p.id} value={p.id}>{p.name}</option>
                                                        ))}
                                                    </select>
                                                    {!item.matchedProductId && (
                                                        <button
                                                            onClick={() => setNewProductModal({
                                                                isOpen: true,
                                                                itemIndex: i,
                                                                name: item.product_name,
                                                                price: item.quantity > 0 ? Number((item.total_price / item.quantity).toFixed(2)) : 0,
                                                                category: 'Genel'
                                                            })}
                                                            disabled={!item.product_name}
                                                            className="bg-stone-800 border border-stone-700 hover:bg-stone-700 text-white px-2 py-2 rounded text-sm whitespace-nowrap transition-colors disabled:opacity-50 flex-shrink-0"
                                                            title="Sisteme yeni ürün olarak ekle"
                                                        >
                                                            ➕
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => {
                                                            const newItems = parsedData.items.filter((_, idx) => idx !== i);
                                                            setParsedData({...parsedData, items: newItems});
                                                        }}
                                                        className="text-red-400 hover:text-red-300 px-2 py-2"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                            <div className="p-4 border-t border-stone-800 bg-stone-800/20 text-center">
                                <button 
                                    onClick={addManualSale}
                                    className="text-amber-400 hover:text-amber-300 font-bold px-4 py-2 border border-amber-400/50 rounded-lg hover:bg-amber-400/10 transition-colors inline-block"
                                >
                                    + Yeni Satış Ekle
                                </button>
                            </div>
                        </div>

                        <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden mt-6">
                            <div className="p-4 border-b border-stone-800 bg-stone-800/50 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-stone-300">Günlük Giderler (Kasadan Çıkanlar)</h3>
                                    <p className="text-sm text-stone-400">Kasadan yapılan masrafları veya uygulanan indirimleri/ikramları buraya ekleyin.</p>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-stone-800">
                                            <th className="text-left px-4 py-3 text-stone-400 text-sm w-[40%]">Gider Adı / Açıklama</th>
                                            <th className="text-left px-4 py-3 text-stone-400 text-sm w-[30%]">Kategori</th>
                                            <th className="text-right px-4 py-3 text-stone-400 text-sm w-[30%]">Tutar</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(parsedData.expenses || []).map((exp, i) => (
                                            <tr key={i} className="border-b border-stone-800 hover:bg-stone-800/50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <input 
                                                        value={exp.expense_name}
                                                        onChange={(e) => {
                                                            const newExps = [...parsedData.expenses!];
                                                            newExps[i].expense_name = e.target.value;
                                                            setParsedData({ ...parsedData, expenses: newExps });
                                                        }}
                                                        placeholder="Örn: Kurye Yemeği, Bahşiş, İndirim"
                                                        className="w-full min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-400"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input 
                                                        value={exp.category || ''}
                                                        onChange={(e) => {
                                                            const newExps = [...parsedData.expenses!];
                                                            newExps[i].category = e.target.value;
                                                            setParsedData({ ...parsedData, expenses: newExps });
                                                        }}
                                                        placeholder="Örn: Personel"
                                                        list="expense-categories"
                                                        className="w-full min-w-0 bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-400"
                                                    />
                                                    <datalist id="expense-categories">
                                                        <option value="Personel" />
                                                        <option value="Mutfak" />
                                                        <option value="Temizlik" />
                                                        <option value="Kurye" />
                                                        <option value="Fatura" />
                                                        <option value="İndirim" />
                                                        <option value="Diğer" />
                                                    </datalist>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span className="text-stone-400">₺</span>
                                                        <input 
                                                            type="number"
                                                            value={exp.amount}
                                                            onChange={(e) => {
                                                                const newExps = [...parsedData.expenses!];
                                                                newExps[i].amount = parseFloat(e.target.value) || 0;
                                                                setParsedData({ ...parsedData, expenses: newExps });
                                                            }}
                                                            className="w-full min-w-[80px] bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-amber-400 text-right"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button 
                                                        onClick={() => {
                                                            const newExps = parsedData.expenses!.filter((_, idx) => idx !== i);
                                                            setParsedData({...parsedData, expenses: newExps});
                                                        }}
                                                        className="text-red-400 hover:text-red-300 px-2 py-2"
                                                    >
                                                        ✕
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {(!parsedData.expenses || parsedData.expenses.length === 0) && (
                                            <tr className="border-b border-stone-800">
                                                <td colSpan={4} className="px-4 py-8 text-center text-stone-500">
                                                    Henüz hiç gider eklenmedi.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-4 border-t border-stone-800 bg-stone-800/20 text-center">
                                <button 
                                    onClick={addManualExpense}
                                    className="text-red-400 hover:text-red-300 font-bold px-4 py-2 border border-red-400/50 rounded-lg hover:bg-red-400/10 transition-colors inline-block"
                                >
                                    - Yeni Gider Ekle
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={handleApprove}
                                disabled={loading}
                                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-4 rounded-xl transition-colors disabled:opacity-50 text-lg"
                            >
                                {loading ? 'Stoklar Düşülüyor...' : 'Onayla ve Stokları Düş 🚀'}
                            </button>
                            <button
                                onClick={() => { setParsedData(null); setImageUrl(null); setFileText(null); setFileType(null); }}
                                disabled={loading}
                                className="bg-stone-800 hover:bg-stone-700 text-white font-bold px-8 py-4 rounded-xl transition-colors disabled:opacity-50"
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* Yeni Ürün Ekleme Modalı */}
            {newProductModal?.isOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold mb-4 text-amber-400">Yeni Ürün Ekle</h3>
                        <p className="text-stone-400 text-sm mb-6">"{newProductModal.name}" sistemde bulunamadı. Yeni bir ürün olarak kataloga ekleyebilirsiniz.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Ürün Adı</label>
                                <input
                                    type="text"
                                    value={newProductModal.name}
                                    onChange={e => setNewProductModal({ ...newProductModal, name: e.target.value })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
                                />
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Kategori</label>
                                <input
                                    list="category-options"
                                    value={newProductModal.category}
                                    onChange={e => setNewProductModal({ ...newProductModal, category: e.target.value })}
                                    placeholder="Listeden seçin veya yeni yazın..."
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
                                />
                                <datalist id="category-options">
                                    {allCategories.map(cat => (
                                        <option key={cat} value={cat} />
                                    ))}
                                </datalist>
                                <p className="text-xs text-stone-500 mt-1">Olmayan bir kategori yazarak sisteme anında ekleyebilirsiniz.</p>
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Satış Fiyatı (₺)</label>
                                <input
                                    type="number"
                                    value={newProductModal.price}
                                    onChange={e => setNewProductModal({ ...newProductModal, price: parseFloat(e.target.value) })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
                                />
                                <p className="text-xs text-stone-500 mt-1">Z raporundan birim fiyatı otomatik hesaplandı.</p>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={handleCreateProduct}
                                disabled={savingProduct || !newProductModal.name}
                                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                            >
                                {savingProduct ? 'Ekleniyor...' : 'Ürünü Kaydet ve Eşleştir'}
                            </button>
                            <button
                                onClick={() => setNewProductModal(null)}
                                className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-3 rounded-xl transition-colors"
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
