'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'

type ParsedItem = {
    name: string
    category?: string
    quantity: number
    unit: string
    totalPrice: number
    unitPrice: number
    selected: boolean
    matchedMaterialId?: string
    isNew: boolean
}

type Material = {
    id: string
    name: string
    category?: string
    unit: string
    price_per_unit: number
    stock_quantity: number
}

export default function FisYukle() {
    const [image, setImage] = useState<string | null>(null)
    const [fileText, setFileText] = useState<string | null>(null)
    const [fileType, setFileType] = useState<'image' | 'pdf' | 'xml' | 'json' | null>(null)
    const [loading, setLoading] = useState(false)
    const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
    const [parsedSupplier, setParsedSupplier] = useState<{ name: string, phone?: string, iban?: string, address?: string, date: string, totalAmount: number, paidAmount: number, statedDebt: number | null } | null>(null)
    const [supplierDebt, setSupplierDebt] = useState<number>(0)
    const [materials, setMaterials] = useState<Material[]>([])
    const [suppliers, setSuppliers] = useState<{id: string, name: string}[]>([])
    const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
    const [error, setError] = useState('')
    const supabase = createClient()
    const router = useRouter()

    // Tedarikçi adı değiştiğinde borcunu getir
    useEffect(() => {
        if (step === 'review' && parsedSupplier?.name) {
            const checkDebt = async () => {
                const { data } = await supabase
                    .from('suppliers')
                    .select('total_debt')
                    .ilike('name', `%${parsedSupplier.name}%`)
                    .limit(1)
                
                if (data && data.length > 0) {
                    setSupplierDebt(parseFloat(data[0].total_debt) || 0)
                } else {
                    setSupplierDebt(0)
                }
            }
            // Kısa bir gecikme ekleyerek her tuş vuruşunda istek atmasını önleyebiliriz ama şimdilik direkt çağırıyoruz
            const timer = setTimeout(checkDebt, 500)
            return () => clearTimeout(timer)
        }
    }, [step, parsedSupplier?.name])

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const fileExt = file.name.split('.').pop()?.toLowerCase()
        if (fileExt === 'xml' || fileExt === 'json') {
            const reader = new FileReader()
            reader.onload = () => {
                setImage(null)
                setFileText(reader.result as string)
                setFileType(fileExt as 'xml' | 'json')
            }
            reader.readAsText(file)
        } else if (fileExt === 'xlsx' || fileExt === 'xls') {
            const reader = new FileReader()
            reader.onload = (evt) => {
                const data = new Uint8Array(evt.target?.result as ArrayBuffer)
                const workbook = XLSX.read(data, { type: 'array' })
                const firstSheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[firstSheetName]
                const json = XLSX.utils.sheet_to_json(worksheet)
                
                setImage(null)
                setFileText(JSON.stringify(json))
                setFileType('json') // AI'a json olarak gönderiyoruz
            }
            reader.readAsArrayBuffer(file)
        } else {
            const reader = new FileReader()
            reader.onload = () => {
                setFileText(null)
                setImage(reader.result as string)
                setFileType(file.type === 'application/pdf' ? 'pdf' : 'image')
            }
            reader.readAsDataURL(file)
        }
    }

    const analyzeReceipt = async () => {
        if (!image && !fileText) return
        setLoading(true)
        setError('')

        try {
            const [
                { data: existingMaterials },
                { data: existingSuppliers }
            ] = await Promise.all([
                supabase.from('materials').select('*'),
                supabase.from('suppliers').select('id, name')
            ])

            setMaterials(existingMaterials || [])
            setSuppliers(existingSuppliers || [])

            const response = await fetch('/api/analyze-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: image,
                    fileText: fileText,
                    fileType: fileType,
                    existingIngredients: existingMaterials?.map(i => i.name) || []
                })
            })

            const data = await response.json()

            if (data.error) {
                setError(data.error)
                setLoading(false)
                return
            }

            const normalizeName = (name: string) => name.replace(/[\.\,\-]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

            const itemsWithMatch = data.items.map((item: ParsedItem) => {
                const normItemName = normalizeName(item.name);
                const matched = existingMaterials?.find(mat => {
                    const normMatName = normalizeName(mat.name);
                    return normMatName === normItemName;
                })
                return {
                    ...item,
                    selected: true,
                    matchedMaterialId: matched?.id,
                    isNew: !matched
                }
            })

            setParsedSupplier({
                name: data.supplier_name || 'Bilinmeyen Tedarikçi',
                phone: data.supplier_phone || '',
                iban: data.supplier_iban || '',
                address: data.supplier_address || '',
                date: data.invoice_date || new Date().toISOString().split('T')[0],
                totalAmount: data.total_amount || 0,
                paidAmount: data.total_amount || 0, // Varsayılan olarak peşin (tamamı ödenmiş) kabul ediyoruz
                statedDebt: data.supplier_stated_debt ?? null
            })

            setParsedItems(itemsWithMatch)
            setStep('review')
        } catch (err: any) {
            setError('Fiş okunamadı, bağlantıyı kontrol edin veya tekrar deneyin.')
        }

        setLoading(false)
    }

    const startManualMode = async () => {
        setLoading(true)
        const [
            { data: existingMaterials },
            { data: existingSuppliers }
        ] = await Promise.all([
            supabase.from('materials').select('*'),
            supabase.from('suppliers').select('id, name')
        ])

        setMaterials(existingMaterials || [])
        setSuppliers(existingSuppliers || [])
        
        setParsedSupplier({
            name: '',
            phone: '',
            iban: '',
            address: '',
            date: new Date().toISOString().split('T')[0],
            totalAmount: 0,
            paidAmount: 0,
            statedDebt: null
        })
        setParsedItems([{
            name: '',
            category: '',
            quantity: 1,
            unit: 'Adet',
            totalPrice: 0,
            unitPrice: 0,
            selected: true,
            isNew: true
        }])
        setStep('review')
        setLoading(false)
    }

    const addManualItem = () => {
        setParsedItems([...parsedItems, {
            name: '',
            category: '',
            quantity: 1,
            unit: 'Adet',
            totalPrice: 0,
            unitPrice: 0,
            selected: true,
            isNew: true
        }])
    }

    const toggleItem = (index: number) => {
        const updated = [...parsedItems]
        updated[index].selected = !updated[index].selected
        setParsedItems(updated)
    }

    const updateItem = (index: number, field: keyof ParsedItem, value: string | number) => {
        const updated = [...parsedItems]
        updated[index] = { ...updated[index], [field]: value }
        setParsedItems(updated)
    }

    const applyChanges = async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        const selectedItems = parsedItems.filter(i => i.selected)
        const batchId = crypto.randomUUID()

        // 1. Tedarikçi Kayıt ve Borç (Cari) İşlemleri
        if (parsedSupplier) {
            let supplierId = null;
            const { data: existingSuppliers } = await supabase.from('suppliers').select('*').eq('name', parsedSupplier.name).limit(1)
            
            if (existingSuppliers && existingSuppliers.length > 0) {
                supplierId = existingSuppliers[0].id
                
                // Mevcut tedarikçinin bilgileri (telefon, adres vb.) eksikse ve faturada varsa onları tamamla!
                const updates: any = {};
                if (!existingSuppliers[0].phone && parsedSupplier.phone) updates.phone = parsedSupplier.phone;
                if (!existingSuppliers[0].iban && parsedSupplier.iban) updates.iban = parsedSupplier.iban;
                if (!existingSuppliers[0].address && parsedSupplier.address) updates.address = parsedSupplier.address;
                
                if (Object.keys(updates).length > 0) {
                    await supabase.from('suppliers').update(updates).eq('id', supplierId);
                }
            } else {
                const { data: newSup } = await supabase.from('suppliers').insert({
                    name: parsedSupplier.name,
                    phone: parsedSupplier.phone || null,
                    iban: parsedSupplier.iban || null,
                    address: parsedSupplier.address || null
                }).select().single()
                if (newSup) supplierId = newSup.id
            }

            if (supplierId) {
                const totalInvoice = parsedSupplier.totalAmount
                const paid = parsedSupplier.paidAmount
                
                // Fatura borcunu ekle
                await supabase.from('supplier_transactions').insert({
                    batch_id: batchId,
                    supplier_id: supplierId,
                    transaction_date: parsedSupplier.date,
                    amount: totalInvoice,
                    transaction_type: 'invoice',
                    note: 'Sistemden Fiş Yükleme (Otomatik Borç)'
                })

                // Ödenen kısmı payment olarak ekle
                if (paid > 0) {
                    await supabase.from('supplier_transactions').insert({
                        batch_id: batchId,
                        supplier_id: supplierId,
                        transaction_date: parsedSupplier.date,
                        amount: paid,
                        transaction_type: 'payment',
                        note: 'Fiş Yükleme Anında Ödeme'
                    })
                }

                // Toplam bakiyeyi (total_debt) güncelle
                const netDebtIncrease = totalInvoice - paid
                if (netDebtIncrease !== 0) {
                    const { data: currentSup } = await supabase.from('suppliers').select('total_debt').eq('id', supplierId).single()
                    const newTotal = parseFloat(currentSup?.total_debt || 0) + netDebtIncrease
                    await supabase.from('suppliers').update({ total_debt: newTotal }).eq('id', supplierId)
                }
            }
        }

        // 2. Hammadde ve Fiyat Güncelleme İşlemleri
        for (const item of selectedItems) {
            let actualMaterialId = item.matchedMaterialId;

            if (item.matchedMaterialId) {
                const existing = materials.find(m => m.id === item.matchedMaterialId)
                const currentStock = existing?.stock_quantity || 0
                const oldPrice = existing?.price_per_unit || 0
                const newPrice = item.unitPrice

                // Mevcut hammaddeyi güncelle
                const updatePayload: any = {
                    price_per_unit: newPrice,
                    stock_quantity: currentStock + item.quantity
                }
                
                // Eğer yeni kategorisi varsa veya boş olanı dolduruyorsak güncelleyelim
                if (item.category && item.category.trim() !== '') {
                    updatePayload.category = item.category.trim()
                }

                await supabase
                    .from('materials')
                    .update(updatePayload)
                    .eq('id', item.matchedMaterialId)

                // Fiyat değiştiyse geçmişe kaydet
                if (oldPrice !== newPrice) {
                    await supabase.from('material_price_history').insert({
                        material_id: item.matchedMaterialId,
                        old_price: oldPrice,
                        new_price: newPrice,
                        source: 'receipt_upload'
                    })
                }
            } else {
                // Önce bu isimde bir hammadde veritabanında (veya bu döngüde) oluşmuş mu diye tekrar kontrol et
                const { data: checkData } = await supabase.from('materials').select('id, stock_quantity, price_per_unit').eq('name', item.name).single()
                
                if (checkData) {
                    actualMaterialId = checkData.id;
                    const updatePayload: any = {
                        price_per_unit: item.unitPrice,
                        stock_quantity: (checkData.stock_quantity || 0) + item.quantity
                    }
                    if (item.category && item.category.trim() !== '') updatePayload.category = item.category.trim();
                    
                    await supabase.from('materials').update(updatePayload).eq('id', checkData.id)
                    
                    if (checkData.price_per_unit !== item.unitPrice) {
                        await supabase.from('material_price_history').insert({
                            material_id: checkData.id,
                            old_price: checkData.price_per_unit,
                            new_price: item.unitPrice,
                            source: 'receipt_upload'
                        })
                    }
                } else {
                    // Gerçekten yepyeni hammadde ekle
                    const { data, error: insertError } = await supabase.from('materials').insert({
                        name: item.name,
                        category: item.category || null,
                        unit: item.unit,
                        price_per_unit: item.unitPrice,
                        stock_quantity: item.quantity
                    }).select().single()

                    if (data) {
                        actualMaterialId = data.id;
                        // İlk fiyatını geçmişe kaydet
                        await supabase.from('material_price_history').insert({
                            material_id: data.id,
                            old_price: 0,
                            new_price: item.unitPrice,
                            source: 'receipt_upload'
                        })
                    } else if (insertError) {
                        console.error("Hammadde eklenirken hata:", insertError);
                    }
                }
            }

            // Stok hareketi (Giriş) olarak kaydet
            if (actualMaterialId) {
                let currentSupplierId = null;
                if (parsedSupplier) {
                    const { data: currentSup } = await supabase.from('suppliers').select('id').eq('name', parsedSupplier.name).limit(1);
                    if (currentSup && currentSup.length > 0) currentSupplierId = currentSup[0].id;
                }

                const { error: smError } = await supabase.from('stock_movements').insert({
                    batch_id: batchId,
                    material_id: actualMaterialId,
                    supplier_id: currentSupplierId,
                    movement_type: 'giris',
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                    note: `Yapay Zeka Fiş Yükleme${parsedSupplier ? ` (${parsedSupplier.name})` : ''}`,
                    document_url: image || null,
                    user_id: user?.id
                })
                
                if (smError) {
                    console.error('Stok hareketi eklenirken hata:', smError)
                }
            }
        }

        logActivity('Stok', 'EKLEME', `Yapay zeka ile fiş okunarak ${selectedItems.length} kalem ürün/stok sisteme eklendi.`, { batchId })
        setStep('done')
        setLoading(false)
    }

    return (
        <div className="min-h-full bg-stone-950 text-white">

            {/* Header */}
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center gap-3">
                <button onClick={() => router.back()} className="text-stone-400 hover:text-white">← Geri</button>
                <span className="text-stone-600">|</span>
                <span className="text-2xl">📸</span>
                <h1 className="font-bold text-amber-400">Fiş Yükle & Otomatik Güncelle</h1>
            </header>

            <main className="p-6 max-w-3xl mx-auto">

                {/* Adım 1: Yükleme */}
                {step === 'upload' && (
                    <div className="space-y-6">
                        <div className="bg-stone-900 border border-stone-800 rounded-xl p-6">
                            <h2 className="font-bold text-lg mb-2">Belge Yükleyin (Görsel, PDF, XML, JSON)</h2>
                            <p className="text-stone-400 text-sm mb-6">Fiş görseli, PDF fatura, XML e-fatura veya JSON fiyat listesi yükleyebilirsiniz. Yapay zeka tüm formatları otomatik okuyacak.</p>

                            <label className="block w-full border-2 border-dashed border-stone-700 hover:border-amber-400 rounded-xl p-8 text-center cursor-pointer transition-colors relative">
                                <input
                                    type="file"
                                    accept="image/*,application/pdf,text/xml,.xml,application/json,.json,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                                {image && fileType === 'image' && (
                                    <img src={image} alt="Fiş" className="max-h-96 mx-auto rounded-lg object-contain" />
                                )}
                                {image && fileType === 'pdf' && (
                                    <div className="py-12">
                                        <div className="text-6xl mb-3">📄</div>
                                        <p className="text-stone-300 font-bold">PDF Seçildi</p>
                                    </div>
                                )}
                                {fileText && fileType === 'xml' && (
                                    <div className="py-12">
                                        <div className="text-6xl mb-3">📰</div>
                                        <p className="text-stone-300 font-bold">XML (E-Fatura) Seçildi</p>
                                    </div>
                                )}
                                {fileText && fileType === 'json' && (
                                    <div className="py-12">
                                        <div className="text-6xl mb-3">🤖</div>
                                        <p className="text-stone-300 font-bold">JSON / Excel Seçildi</p>
                                    </div>
                                )}
                                {!image && !fileText && (
                                    <div>
                                        <div className="text-5xl mb-3">📂</div>
                                        <p className="text-stone-400">Dosya seç veya sürükle</p>
                                        <p className="text-stone-600 text-sm mt-1">JPG, PNG, PDF, XML, JSON, XLSX desteklenir</p>
                                    </div>
                                )}
                            </label>

                            <div className="flex items-center gap-4 my-6">
                                <div className="h-px bg-stone-800 flex-1"></div>
                                <span className="text-stone-500 text-sm">VEYA LİNK KULLANIN</span>
                                <div className="h-px bg-stone-800 flex-1"></div>
                            </div>

                            <input 
                                type="url" 
                                placeholder="Fiş resmi URL'sini yapıştırın (https://...)" 
                                value={image && image.startsWith('http') ? image : ''}
                                onChange={(e) => setImage(e.target.value || null)}
                                className="w-full bg-stone-950 border border-stone-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                            />
                            
                            {image && image.startsWith('http') && (
                                <div className="mt-4">
                                   <img src={image} alt="URL Önizleme" className="max-h-96 mx-auto rounded-lg object-contain" onError={() => setError('URL\'den resim yüklenemedi, linki kontrol edin.')} />
                                </div>
                            )}
                        </div>

                        {(image || fileText) && (
                            <button
                                onClick={analyzeReceipt}
                                disabled={loading}
                                className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-4 rounded-xl transition-colors disabled:opacity-50 text-lg"
                            >
                                {loading ? '🔍 Belge okunuyor, lütfen bekleyin...' : '🧠 Yapay Zeka ile Analiz Et'}
                            </button>
                        )}

                        {!image && !fileText && (
                            <>
                                <div className="flex items-center gap-4 my-6">
                                    <div className="h-px bg-stone-800 flex-1"></div>
                                    <span className="text-stone-500 text-sm font-bold">YAPAY ZEKA İSTEMİYOR MUSUNUZ?</span>
                                    <div className="h-px bg-stone-800 flex-1"></div>
                                </div>
                                <button
                                    onClick={startManualMode}
                                    disabled={loading}
                                    className="w-full bg-stone-800 hover:bg-stone-700 text-white font-bold py-4 rounded-xl transition-colors border border-stone-700 text-lg"
                                >
                                    ✍️ Fatura/Fişi Manuel Gir
                                </button>
                            </>
                        )}

                        {error && (
                            <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 text-red-400">
                                {error}
                            </div>
                        )}
                    </div>
                )}

                {step === 'review' && (
                    <div className="space-y-4">
                        {parsedSupplier && (
                            <div className="bg-stone-900 border border-amber-500/50 rounded-xl p-5 mb-6">
                                <h3 className="font-bold text-amber-400 mb-4 flex items-center gap-2">
                                    <span className="text-xl">🏢</span> Tedarikçi ve Cari (Borç) Bilgileri
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="md:col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-stone-800 pb-4 mb-2">
                                        <div>
                                            <label className="text-stone-500 text-xs mb-1 block">Tedarikçi Adı (Seç veya Yeni Yaz)</label>
                                            <input
                                                list="supplier-options"
                                                type="text"
                                                value={parsedSupplier.name}
                                                onChange={e => setParsedSupplier({...parsedSupplier, name: e.target.value})}
                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                            />
                                            <datalist id="supplier-options">
                                                {suppliers.map(sup => (
                                                    <option key={sup.id} value={sup.name} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="text-stone-500 text-xs mb-1 block">Fatura Tarihi</label>
                                            <input
                                                type="date"
                                                value={parsedSupplier.date}
                                                onChange={e => setParsedSupplier({...parsedSupplier, date: e.target.value})}
                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-stone-500 text-xs mb-1 block">Önceki Bakiye (Borç)</label>
                                        <div className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-stone-400 font-medium">
                                            ₺{supplierDebt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-stone-500 text-xs mb-1 block">Yeni Fatura Tutarı (+)</label>
                                        <input
                                            type="number"
                                            value={parsedSupplier.totalAmount}
                                            onChange={e => setParsedSupplier({...parsedSupplier, totalAmount: parseFloat(e.target.value) || 0})}
                                            className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-red-400 focus:outline-none focus:border-red-400"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-stone-500 text-xs mb-1 block">Genel Toplam Borç (=)</label>
                                        <div className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white font-bold text-lg relative group">
                                            ₺{(supplierDebt + parsedSupplier.totalAmount).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                                            {parsedSupplier.statedDebt != null && (
                                                <div className="absolute top-full left-0 mt-2 w-full bg-blue-950/80 border border-blue-500 rounded p-2 text-xs text-blue-200 shadow-xl z-10">
                                                    📄 Faturada yazan güncel bakiye: <strong>₺{parsedSupplier.statedDebt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>
                                                    <br/>(Sistemdeki bakiye ile kıyaslayabilirsiniz)
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-stone-500 text-xs mb-1 block">Şimdi Yapılan Ödeme (-)</label>
                                        <input
                                            type="number"
                                            value={parsedSupplier.paidAmount}
                                            onChange={e => setParsedSupplier({...parsedSupplier, paidAmount: parseFloat(e.target.value) || 0})}
                                            className="w-full bg-stone-800 border border-amber-500 rounded-lg px-3 py-2 text-green-400 font-bold focus:outline-none focus:border-green-400 text-lg"
                                        />
                                        <p className="text-xs text-stone-500 mt-1">Sıfırsa tamamen borca eklenir.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="bg-stone-900 border border-stone-800 rounded-xl p-4">
                            <p className="text-stone-400 text-sm">
                                <span className="text-amber-400 font-bold">{parsedItems.length} kalem</span> tespit edildi.
                                Güncellemek istediklerinizi seçin, fiyatları kontrol edin.
                            </p>
                        </div>

                        {parsedItems.map((item, index) => (
                            <div
                                key={index}
                                className={`bg-stone-900 border rounded-xl p-4 transition-colors ${item.selected ? 'border-amber-400' : 'border-stone-800 opacity-50'}`}
                            >
                                <div className="flex items-start gap-3">
                                    <input
                                        type="checkbox"
                                        checked={item.selected}
                                        onChange={() => toggleItem(index)}
                                        className="mt-1 w-4 h-4 accent-amber-400"
                                    />
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-3">
                                            <input 
                                                list="material-options" 
                                                value={item.name} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    const matched = materials.find(m => m.name.toLowerCase() === val.toLowerCase());
                                                    const updated = [...parsedItems];
                                                    updated[index].name = val;
                                                    updated[index].matchedMaterialId = matched?.id;
                                                    updated[index].isNew = !matched;
                                                    updated[index].unit = matched?.unit || updated[index].unit;
                                                    setParsedItems(updated);
                                                }}
                                                placeholder="Ürün adı (Seç/Yaz)"
                                                className="bg-stone-800 text-white font-bold px-3 py-2 border border-stone-700 rounded-lg focus:outline-none focus:border-amber-400 flex-1"
                                            />
                                            <datalist id="material-options">
                                                {materials.map(m => <option key={m.id} value={m.name} />)}
                                            </datalist>
                                            
                                            {item.isNew ? (
                                                <span className="text-xs bg-green-900 text-green-400 px-2 py-1 rounded-full whitespace-nowrap">Yeni Kayıt</span>
                                            ) : (
                                                <span className="text-xs bg-blue-900 text-blue-400 px-2 py-1 rounded-full whitespace-nowrap">Stok Ekle</span>
                                            )}
                                            <button onClick={() => {
                                                const updated = parsedItems.filter((_, i) => i !== index);
                                                setParsedItems(updated);
                                            }} className="text-red-400 hover:text-red-300 ml-2">✕</button>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div>
                                                <label className="text-stone-500 text-xs mb-1 block">Kategori</label>
                                                <input
                                                    list="category-options"
                                                    value={item.category || ''}
                                                    onChange={e => updateItem(index, 'category', e.target.value)}
                                                    placeholder="Seç/Yaz"
                                                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-400"
                                                />
                                                <datalist id="category-options">
                                                    <option value="Süt Ürünleri" />
                                                    <option value="Unlu Mamuller" />
                                                    <option value="Sebze/Meyve" />
                                                    <option value="Et ve Tavuk" />
                                                    <option value="İçecek" />
                                                    <option value="Kuru Gıda" />
                                                    <option value="Temizlik" />
                                                    <option value="Ambalaj" />
                                                </datalist>
                                            </div>
                                            <div>
                                                <label className="text-stone-500 text-xs mb-1 block">Miktar</label>
                                                <input
                                                    type="number"
                                                    value={Number.isNaN(item.quantity) ? '' : item.quantity}
                                                    onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value))}
                                                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-stone-500 text-xs mb-1 block">Birim</label>
                                                <select
                                                    value={item.unit}
                                                    onChange={e => updateItem(index, 'unit', e.target.value)}
                                                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-400"
                                                >
                                                    {['Gram', 'Kg', 'Ml', 'Litre', 'Adet', 'Paket'].map(u =>
                                                        <option key={u} value={u}>{u}</option>
                                                    )}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-stone-500 text-xs mb-1 block">Birim Fiyat (₺)</label>
                                                <input
                                                    type="number"
                                                    value={Number.isNaN(item.unitPrice) ? '' : item.unitPrice}
                                                    onChange={e => updateItem(index, 'unitPrice', parseFloat(e.target.value))}
                                                    className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <div className="flex justify-center mt-4">
                            <button onClick={addManualItem} className="text-amber-400 hover:text-amber-300 border border-amber-400/50 hover:bg-amber-950 px-6 py-2 rounded-lg font-bold transition-colors">
                                + Yeni Kalem Ekle
                            </button>
                        </div>

                        <div className="flex gap-3 pt-4 border-t border-stone-800 mt-6">
                            <button
                                onClick={applyChanges}
                                disabled={loading || parsedItems.filter(i => i.selected).length === 0}
                                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                            >
                                {loading ? 'Kaydediliyor...' : `✓ ${parsedItems.filter(i => i.selected).length} Kalemi Uygula`}
                            </button>
                            <button
                                onClick={() => { setStep('upload'); setImage(null); setFileText(null); setFileType(null); setParsedItems([]) }}
                                className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-3 rounded-xl transition-colors"
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                )}

                {/* Adım 3: Tamamlandı */}
                {step === 'done' && (
                    <div className="text-center py-16">
                        <div className="text-6xl mb-4">✅</div>
                        <h2 className="text-2xl font-bold text-green-400 mb-2">Güncelleme Tamamlandı!</h2>
                        <p className="text-stone-400 mb-8">Hammadde fiyatları başarıyla güncellendi.</p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => router.push('/dashboard/hammaddeler')}
                                className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-3 rounded-xl transition-colors"
                            >
                                Hammaddelere Git
                            </button>
                            <button
                                onClick={() => { setStep('upload'); setImage(null); setParsedItems([]) }}
                                className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-3 rounded-xl transition-colors"
                            >
                                Yeni Fiş Yükle
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}