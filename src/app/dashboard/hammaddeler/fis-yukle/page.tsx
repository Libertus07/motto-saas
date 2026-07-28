'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { devLog, devError } from '@/lib/debug';
import { formatCurrency } from "@/lib/format";
import { useNotification } from '@/components/NotificationProvider'

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
    boxMultiplier?: number
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
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [loading, setLoading] = useState(false)
    const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
    const [parsedSupplier, setParsedSupplier] = useState<{ id?: string, name: string, phone?: string, iban?: string, address?: string, date: string, totalAmount: number, paidAmount: number, statedDebt: number | null } | null>(null)
    const [supplierDebt, setSupplierDebt] = useState<number>(0)
    const [materials, setMaterials] = useState<Material[]>([])
    const [suppliers, setSuppliers] = useState<{id: string, name: string}[]>([])
    const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
    const [error, setError] = useState('')
    const { showAlert, showConfirm } = useNotification()
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

        setSelectedFile(file)

        // Vercel 4.5MB request body limit => ~3.3MB file size max.
        // We set a 3MB safe limit.
        if (file.size > 3 * 1024 * 1024) {
            showAlert('Seçtiğiniz belge çok büyük (Max 3MB). Sunucu limitlerine takılmamak için lütfen dosya boyutunu küçültün veya ekran görüntüsü (fotoğraf) kırparak yükleyin.', 'warning');
            e.target.value = '';
            return;
        }

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
                    fileType: fileType
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
                paidAmount: 0, // Varsayılan olarak cariye (borca) yazılacak
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
            id: undefined,
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
        setSelectedFile(null)
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
        
        // --- ÇİFT KAYIT KONTROLÜ BAŞLANGIÇ ---
        if (parsedSupplier && parsedSupplier.id && parsedSupplier.date && parsedSupplier.totalAmount) {
            const { data: dupData } = await supabase
                .from('supplier_transactions')
                .select('batch_id, id')
                .eq('supplier_id', parsedSupplier.id)
                .eq('transaction_date', parsedSupplier.date)
                .eq('amount', parsedSupplier.totalAmount)
                .eq('transaction_type', 'invoice')
                .limit(1)

            if (dupData && dupData.length > 0 && dupData[0].batch_id) {
                const confirmed = await showConfirm(
                    'Bu tedarikçiye ait, bu tarih ve tutarda bir fiş daha önce yüklenmiş görünüyor.\n\nÖnceki kaydı silip bu yeni yüklediğiniz bilgilerle (eksik/fazlaları düzelterek) güncellemek istiyor musunuz?',
                    'warning'
                )
                if (!confirmed) {
                    setLoading(false)
                    return // İptal edildi
                }
                
                // Kullanıcı onayladı, eski fişi sil (Rollback)
                const { error: delError } = await supabase.rpc('delete_receipt_transaction', { p_batch_id: dupData[0].batch_id })
                if (delError) {
                    setError("Eski fiş silinirken hata oluştu: " + delError.message)
                    setLoading(false)
                    return
                }
            }
        }
        // --- ÇİFT KAYIT KONTROLÜ BİTİŞ ---

        const { data: { user } } = await supabase.auth.getUser()
        const selectedItems = parsedItems.filter(i => i.selected)
        const batchId = crypto.randomUUID()

        let uploadedUrl = null;
        if (selectedFile) {
            const fileExt = selectedFile.name.split('.').pop();
            const fileName = `receipt-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('motto_assets')
                .upload(fileName, selectedFile);
            if (!uploadError && uploadData) {
                const { data: urlData } = supabase.storage.from('motto_assets').getPublicUrl(fileName);
                uploadedUrl = urlData.publicUrl;
            } else if (uploadError) {
                console.error("Storage upload error:", uploadError);
            }
        }

        const parseNum = (val: any) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            return parseFloat(val.toString().replace(/,/g, '.')) || 0;
        }

        const payload = {
            user_id: user?.id,
            batch_id: batchId,
            image_url: uploadedUrl,
            supplier: parsedSupplier ? {
                id: parsedSupplier.id || null,
                name: parsedSupplier.name,
                phone: parsedSupplier.phone || null,
                iban: parsedSupplier.iban || null,
                address: parsedSupplier.address || null,
                date: parsedSupplier.date,
                totalAmount: parsedSupplier.totalAmount,
                paidAmount: parsedSupplier.paidAmount
            } : null,
            items: selectedItems.map(item => ({
                matchedMaterialId: item.matchedMaterialId || null,
                name: item.name || 'İsimsiz Ürün',
                category: item.category || 'Diğer',
                unit: item.unit || 'Adet',
                quantity: parseNum(item.quantity),
                unitPrice: parseNum(item.unitPrice)
            }))
        }

        const { data: rpcResult, error: rpcError } = await supabase.rpc('process_receipt_upload', { payload })

        if (rpcError) {
            console.error("RPC ERROR DETAILS:", rpcError);
            devError("Fiş yükleme atomic işlem hatası:", rpcError?.message, rpcError?.details, rpcError?.hint, rpcError?.code)
            setError("Kayıt sırasında kritik bir hata oluştu. İşlem geri alındı: " + (rpcError?.message || JSON.stringify(rpcError)))
            setLoading(false)
            return
        }

        const auditDetailsText = rpcResult?.audit_details || '';
        logActivity('Stok', 'EKLEME', `Yapay zeka ile fiş okunarak ${selectedItems.length} kalem ürün/stok sisteme eklendi.`, { batchId, detay: auditDetailsText })
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

                            <label className="block w-full border-2 border-dashed border-stone-700 hover:border-amber-400 rounded-xl p-8 text-center cursor-pointer transition-colors relative overflow-hidden">
                                <input
                                    type="file"
                                    accept="image/*,application/pdf,text/xml,.xml,application/json,.json,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                    onChange={handleImageUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
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
                    <div className="space-y-6">
                        {error && (
                            <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 text-red-400 mb-6">
                                {error}
                            </div>
                        )}
                        {parsedSupplier && (
                            <div className="bg-stone-900 border border-amber-500/50 rounded-xl p-5 mb-6">
                                <h3 className="font-bold text-amber-400 mb-4 flex items-center gap-2">
                                    <span className="text-xl">🏢</span> Tedarikçi ve Cari (Borç) Bilgileri
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-b border-stone-800/80 pb-5 mb-5">
                                    <div>
                                        <label className="text-stone-400 text-xs font-semibold mb-2 block uppercase tracking-wider">Tedarikçi Adı (Seç veya Yeni Yaz)</label>
                                        <input
                                            list="supplier-options"
                                            type="text"
                                            value={parsedSupplier.name}
                                            onChange={e => {
                                                const val = e.target.value;
                                                const matchedSup = suppliers.find(s => s.name.trim().toLowerCase() === val.trim().toLowerCase());
                                                setParsedSupplier({
                                                    ...parsedSupplier, 
                                                    name: val,
                                                    id: matchedSup?.id
                                                });
                                            }}
                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors font-medium"
                                        />
                                        <datalist id="supplier-options">
                                            {suppliers.map(sup => (
                                                <option key={sup.id} value={sup.name} />
                                            ))}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="text-stone-400 text-xs font-semibold mb-2 block uppercase tracking-wider">Fatura Tarihi</label>
                                        <input
                                            type="date"
                                            value={parsedSupplier.date}
                                            onChange={e => setParsedSupplier({...parsedSupplier, date: e.target.value})}
                                            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500 transition-colors font-medium [color-scheme:dark]"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {/* Card 1: Önceki Bakiye */}
                                    <div className="bg-stone-950 rounded-xl p-4 border border-stone-800 flex flex-col justify-center">
                                        <span className="text-stone-500 text-xs font-semibold mb-1 uppercase tracking-wider">Önceki Bakiye (Borç)</span>
                                        <span className="text-stone-400 font-medium text-xl">{formatCurrency(supplierDebt)}</span>
                                    </div>
                                    
                                    {/* Card 2: Yeni Fatura Tutarı */}
                                    <div className="bg-stone-950 rounded-xl p-4 border border-stone-800 focus-within:border-red-500/50 transition-colors flex flex-col justify-center">
                                        <span className="text-stone-500 text-xs font-semibold mb-1 uppercase tracking-wider">Yeni Fatura Tutarı (+)</span>
                                        <div className="flex items-center">
                                            <span className="text-stone-500 font-medium mr-1">₺</span>
                                            <input
                                                type="number"
                                                value={parsedSupplier.totalAmount}
                                                onChange={e => setParsedSupplier({...parsedSupplier, totalAmount: parseFloat(e.target.value) || 0})}
                                                className="w-full bg-transparent text-red-400 font-bold focus:outline-none text-xl"
                                            />
                                        </div>
                                    </div>
                                    
                                    {/* Card 3: Genel Toplam Borç */}
                                    <div className="bg-stone-950 rounded-xl p-4 border border-stone-800 flex flex-col justify-center relative group">
                                        <span className="text-stone-500 text-xs font-semibold mb-1 uppercase tracking-wider">Genel Toplam Borç (=)</span>
                                        <span className="text-white font-bold text-xl">{formatCurrency((supplierDebt + parsedSupplier.totalAmount))}</span>
                                        {parsedSupplier.statedDebt != null && (
                                            <div className="absolute top-[110%] left-0 w-full min-w-[200px] bg-blue-950/95 border border-blue-500/50 rounded-xl p-3 text-xs text-blue-200 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20 backdrop-blur-md">
                                                📄 Faturada yazan güncel bakiye:<br/>
                                                <strong className="text-sm text-blue-100 mt-1 block">{formatCurrency(parsedSupplier.statedDebt)}</strong>
                                                <span className="text-[10px] text-blue-400/60 mt-1 block leading-tight">(Sistemdeki bakiye ile kıyaslayabilirsiniz)</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Card 4: Yapılan Ödeme */}
                                    <div className="bg-amber-500/5 rounded-xl p-4 border border-amber-500/30 focus-within:border-amber-500/60 transition-colors flex flex-col justify-center">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-amber-500/80 text-xs font-semibold uppercase tracking-wider">Şimdi Yapılan Ödeme (-)</span>
                                            <span className="text-[9px] text-amber-500/50 uppercase tracking-wider px-1.5 py-0.5 bg-amber-500/10 rounded hidden xl:block">Sıfırsa borca yazılır</span>
                                        </div>
                                        <div className="flex items-center">
                                            <span className="text-amber-500/50 font-medium mr-1">₺</span>
                                            <input
                                                type="number"
                                                value={parsedSupplier.paidAmount}
                                                onChange={e => setParsedSupplier({...parsedSupplier, paidAmount: parseFloat(e.target.value) || 0})}
                                                className="w-full bg-transparent text-green-400 font-bold focus:outline-none text-xl"
                                            />
                                        </div>
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
                                <div className="flex items-center gap-3 pt-2">
                                    <input
                                        type="checkbox"
                                        checked={item.selected}
                                        onChange={() => toggleItem(index)}
                                        className="w-5 h-5 accent-amber-400 cursor-pointer"
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
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                            <div className="flex flex-col justify-end">
                                                <label className="text-stone-500 text-xs mb-1 block truncate">Kategori</label>
                                                <input
                                                    list="category-options"
                                                    value={item.category || ''}
                                                    onChange={e => updateItem(index, 'category', e.target.value)}
                                                    placeholder="Seç/Yaz"
                                                    className="w-full h-9 bg-stone-800 border border-stone-700 rounded px-2 text-sm text-white focus:outline-none focus:border-amber-400"
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
                                            <div className="flex flex-col justify-end">
                                                <label className="text-stone-500 text-xs mb-1 block truncate">Miktar</label>
                                                <input
                                                    type="number"
                                                    value={Number.isNaN(item.quantity) ? '' : item.quantity}
                                                    onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value))}
                                                    className="w-full h-9 bg-stone-800 border border-stone-700 rounded px-2 text-sm text-white font-medium focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div className="flex flex-col justify-end">
                                                <label className="text-stone-500 text-xs mb-1 block truncate">Birim</label>
                                                <select
                                                    value={item.unit}
                                                    onChange={e => updateItem(index, 'unit', e.target.value)}
                                                    className="w-full h-9 bg-stone-800 border border-stone-700 rounded px-2 text-sm text-white focus:outline-none focus:border-amber-400"
                                                >
                                                    {['Gram', 'Kg', 'Ml', 'Litre', 'Adet', 'Paket', 'Kutu', 'Koli'].map(u =>
                                                        <option key={u} value={u}>{u}</option>
                                                    )}
                                                </select>
                                            </div>
                                            <div className="flex flex-col justify-end">
                                                <label className="text-stone-500 text-xs mb-1 block truncate">Birim Fiyat (₺)</label>
                                                <input
                                                    type="number"
                                                    value={Number.isNaN(item.unitPrice) ? '' : item.unitPrice}
                                                    onChange={e => updateItem(index, 'unitPrice', parseFloat(e.target.value))}
                                                    className="w-full h-9 bg-stone-800 border border-stone-700 rounded px-2 text-sm text-white font-medium focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div className="col-span-2 md:col-span-1 flex flex-col justify-end">
                                                <label className="text-stone-500 text-xs mb-1 block truncate">Toplam Tutar</label>
                                                <div className="w-full h-9 flex items-center bg-stone-900 border border-stone-800 rounded px-2 text-sm font-bold text-amber-400 overflow-hidden text-ellipsis whitespace-nowrap">
                                                    {formatCurrency((Number.isNaN(item.quantity) ? 0 : item.quantity) * (Number.isNaN(item.unitPrice) ? 0 : item.unitPrice))}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            {(item.unit.toLowerCase() === 'kg' || item.unit.toLowerCase() === 'kilogram' || item.unit.toLowerCase() === 'litre' || item.unit.toLowerCase() === 'l') && (
                                              <button 
                                                type="button"
                                                onClick={() => {
                                                  const currentQty = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity) || 0;
                                                  const currentPrice = typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice) || 0;
                                                  const u = item.unit.toLowerCase();
                                                  const updated = [...parsedItems];
                                                  updated[index].unit = (u === 'kg' || u === 'kilogram') ? 'Gram' : 'Ml';
                                                  updated[index].quantity = currentQty * 1000;
                                                  updated[index].unitPrice = parseFloat((currentPrice / 1000).toFixed(4));
                                                  setParsedItems(updated);
                                                }}
                                                className="bg-indigo-600/20 border border-indigo-500/50 hover:bg-indigo-600 hover:text-white text-indigo-400 font-medium px-4 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2"
                                              >
                                                ⚖️ {(item.unit.toLowerCase() === 'kg' || item.unit.toLowerCase() === 'kilogram') ? 'Gram' : 'Ml'}'a Dönüştür
                                              </button>
                                            )}
                                            {(item.unit.toLowerCase() === 'kutu' || item.unit.toLowerCase() === 'koli' || item.unit.toLowerCase() === 'paket' || item.unit.toLowerCase() === 'adet') && (
                                              <div className="flex items-center gap-2 bg-stone-800/80 border border-stone-700 px-3 py-1.5 rounded-lg">
                                                <span className="text-xs text-stone-400 font-medium">İçindeki Adet:</span>
                                                <input 
                                                    id={`koli-carpan-fis-${index}`} 
                                                    type="number" 
                                                    defaultValue={item.boxMultiplier || 12} 
                                                    className="w-14 bg-stone-950 border border-stone-700 rounded px-1 py-1 text-white text-xs text-center focus:outline-none focus:border-indigo-500" 
                                                />
                                                <button 
                                                  type="button"
                                                  onClick={() => {
                                                    const input = document.getElementById(`koli-carpan-fis-${index}`) as HTMLInputElement;
                                                    const mult = parseInt(input?.value || '1');
                                                    if (mult > 1) {
                                                        const currentQty = typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity) || 0;
                                                        const currentPrice = typeof item.unitPrice === 'number' ? item.unitPrice : parseFloat(item.unitPrice) || 0;
                                                        const updated = [...parsedItems];
                                                        updated[index].unit = 'Adet';
                                                        updated[index].quantity = currentQty * mult;
                                                        updated[index].unitPrice = parseFloat((currentPrice / mult).toFixed(4));
                                                        // Total price remains the same (quantity * unitPrice)
                                                        setParsedItems(updated);
                                                    }
                                                  }}
                                                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-3 py-1 rounded text-xs transition-colors"
                                                >
                                                  Adete Çevir
                                                </button>
                                              </div>
                                            )}
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
                                onClick={() => { setStep('upload'); setImage(null); setFileText(null); setFileType(null); setSelectedFile(null); setParsedItems([]) }}
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
                                onClick={() => { setStep('upload'); setImage(null); setSelectedFile(null); setParsedItems([]) }}
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