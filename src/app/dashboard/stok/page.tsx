'use client'

import { useState, useEffect, Fragment, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { formatCurrency, formatDate } from "@/lib/format";

type Material = {
    id: string
    name: string
    unit: string
    price_per_unit: number
    stock_quantity: number
    critical_stock_level: number
}

type Movement = {
    id: string
    material_id: string
    movement_type: string
    quantity: number
    unit_price: number
    note: string
    created_at: string
    materials?: { name: string; unit: string }
}

export default function Stok() {
    const { showAlert, showConfirm } = useNotification()
    const [materials, setMaterials] = useState<Material[]>([])
    const [movements, setMovements] = useState<Movement[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<'stok' | 'hareket' | 'sayim' | 'zayi'>('stok')
    const [showForm, setShowForm] = useState(false)
    const [form, setForm] = useState({
        material_id: '',
        movement_type: 'giris',
        quantity: '',
        unit_price: '',
        note: ''
    })
    
    // Inline Form State
    const [inlineMovementMatId, setInlineMovementMatId] = useState<string | null>(null)
    const [inlineMovementType, setInlineMovementType] = useState<'giris' | 'cikis'>('giris')
    const [inlineForm, setInlineForm] = useState({ quantity: '', unit_price: '', note: '' })

    const [sayimData, setSayimData] = useState<{ [key: string]: string }>({})
    const [sayimSearchTerm, setSayimSearchTerm] = useState('')
    const [movementSearchTerm, setMovementSearchTerm] = useState('')
    const [movementTypeFilter, setMovementTypeFilter] = useState<'tumu' | 'giris' | 'cikis' | 'fire' | 'sayim'>('tumu')
    const [movementDateFilter, setMovementDateFilter] = useState<'bugun' | 'bu_hafta' | 'bu_ay' | 'custom' | 'tumu'>('bu_ay')
    const [movementStartDate, setMovementStartDate] = useState('')
    const [movementEndDate, setMovementEndDate] = useState('')
    const [movementPage, setMovementPage] = useState(1)
    const [movementCollapsedDates, setMovementCollapsedDates] = useState<Set<string>>(() => new Set())
    const [zayiDateFilter, setZayiDateFilter] = useState<'bugun' | 'bu_hafta' | 'bu_ay' | 'tumu'>('bu_ay')
    const [zayiSortBy, setZayiSortBy] = useState<'tarih_yeni' | 'tarih_eski' | 'tutar_yuksek' | 'tutar_dusuk'>('tarih_yeni')
    const [zayiSearchTerm, setZayiSearchTerm] = useState('')
    const [zayiExpandedDates, setZayiExpandedDates] = useState<string[]>(['Bugün'])
    
    // Sayım Takip State
    const [inventoryCountDay, setInventoryCountDay] = useState<number>(1)
    const [lastCountDate, setLastCountDate] = useState<Date | null>(null)
    
    const supabase = createClient()
    const router = useRouter()

    useEffect(() => {
        fetchData()
    }, [])

    const fetchData = async () => {
        const [{ data: mats }, { data: movs }, { data: settingsData }] = await Promise.all([
            supabase.from('materials').select('*').order('name'),
            supabase.from('stock_movements')
                .select('*, materials(name, unit)')
                .order('created_at', { ascending: false }),
            supabase.from('settings').select('key, value').in('key', ['inventory_count_day', 'last_inventory_count_date'])
        ])
        setMaterials(mats || [])
        setMovements(movs || [])
        
        if (settingsData) {
            const countDay = settingsData.find(s => s.key === 'inventory_count_day')
            if (countDay) setInventoryCountDay(parseInt(countDay.value) || 1)
            
            const lastDate = settingsData.find(s => s.key === 'last_inventory_count_date')
            if (lastDate && lastDate.value) setLastCountDate(new Date(lastDate.value))
        }
        setLoading(false)
    }

    const handleMovement = async () => {
        if (!form.material_id || !form.quantity) return

        const material = materials.find(i => i.id === form.material_id)
        if (!material) return

        const quantity = parseFloat(form.quantity)
        const currentStock = material.stock_quantity || 0
        const isOutgoing = form.movement_type === 'cikis' || form.movement_type === 'fire'

        if (!Number.isFinite(quantity) || quantity <= 0) {
            await showAlert('Lütfen 0’dan büyük geçerli bir miktar girin.', 'warning')
            return
        }

        if (isOutgoing && quantity > currentStock) {
            await showAlert(
                `${material.name} için ${quantity} ${material.unit} çıkış yapılamaz. Mevcut stok ${currentStock} ${material.unit}.`,
                'warning',
                'Yetersiz Stok ⚠️'
            )
            return
        }

        const unitPrice = form.unit_price ? parseFloat(form.unit_price) : material.price_per_unit
        const { data: movementResult, error: movementError } = await supabase.rpc('record_stock_movement', {
            p_material_id: form.material_id,
            p_movement_type: form.movement_type,
            p_quantity: quantity,
            p_unit_price: unitPrice,
            p_note: form.note || null
        })

        if (movementError) {
            await showAlert(movementError.message || 'Stok hareketi kaydedilirken hata oluştu.', 'error')
            return
        }

        const newQuantity = Number(movementResult?.new_stock ?? currentStock)

        setForm({ material_id: '', movement_type: 'giris', quantity: '', unit_price: '', note: '' })
        setShowForm(false)
        fetchData()
        
        const details = `Stok: ${currentStock} -> ${newQuantity} ${material.unit}`
        await logActivity('Stok', 'EKLEME', `${material.name} ürününe ${quantity} ${material.unit} manuel ${form.movement_type} işlemi yapıldı.`, { detay: details })
        await showAlert(`${material.name} için stok hareketi başarıyla kaydedildi.`, 'success')
    }

    const handleInlineSubmit = async () => {
        if (!inlineMovementMatId || !inlineForm.quantity) return

        const material = materials.find(i => i.id === inlineMovementMatId)
        if (!material) return

        const quantity = parseFloat(inlineForm.quantity)
        const currentStock = material.stock_quantity || 0

        if (!Number.isFinite(quantity) || quantity <= 0) {
            await showAlert('Lütfen 0’dan büyük geçerli bir miktar girin.', 'warning')
            return
        }

        if (inlineMovementType === 'cikis' && quantity > currentStock) {
            await showAlert(
                `${material.name} için ${quantity} ${material.unit} hızlı çıkış yapılamaz. Mevcut stok ${currentStock} ${material.unit}.`,
                'warning',
                'Yetersiz Stok ⚠️'
            )
            return
        }

        const unitPrice = inlineForm.unit_price ? parseFloat(inlineForm.unit_price) : material.price_per_unit
        const { data: movementResult, error: movementError } = await supabase.rpc('record_stock_movement', {
            p_material_id: inlineMovementMatId,
            p_movement_type: inlineMovementType,
            p_quantity: quantity,
            p_unit_price: unitPrice,
            p_note: inlineForm.note || (inlineMovementType === 'giris' ? 'Hızlı Giriş' : 'Hızlı Çıkış')
        })

        if (movementError) {
            await showAlert(movementError.message || 'Hızlı stok hareketi kaydedilirken hata oluştu.', 'error')
            return
        }

        const newQuantity = Number(movementResult?.new_stock ?? currentStock)

        setInlineMovementMatId(null)
        setInlineForm({ quantity: '', unit_price: '', note: '' })
        fetchData()
        
        const details = `Stok: ${currentStock} -> ${newQuantity} ${material.unit}`
        await logActivity('Stok', 'EKLEME', `${material.name} ürününe ${quantity} ${material.unit} hızlı ${inlineMovementType} işlemi yapıldı.`, { detay: details })
        await showAlert(`${material.name} için hızlı stok işlemi kaydedildi.`, 'success')
    }

    const handleSayim = async () => {
        const pendingAdjustments = Object.entries(sayimData)
            .map(([materialId, quantity]) => {
                const material = materials.find(i => i.id === materialId)
                const sayimQty = parseFloat(quantity)

                if (!material || !quantity || !Number.isFinite(sayimQty) || sayimQty < 0) {
                    return null
                }

                const currentStock = material.stock_quantity || 0
                const diff = sayimQty - currentStock

                if (diff === 0) return null

                return {
                    material,
                    materialId,
                    sayimQty,
                    currentStock,
                    diff,
                }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)

        if (pendingAdjustments.length === 0) {
            await showAlert('Kaydedilecek bir sayım farkı bulunamadı.', 'info')
            return
        }

        const confirmLines = pendingAdjustments
            .slice(0, 8)
            .map(item => `• ${item.material.name}: ${item.currentStock} → ${item.sayimQty} ${item.material.unit}`)

        if (pendingAdjustments.length > 8) {
            confirmLines.push(`• ... ve ${pendingAdjustments.length - 8} ürün daha`)
        }

        const confirmed = await showConfirm(
            `${pendingAdjustments.length} ürün için sayım düzeltmesi uygulanacak.\n\n${confirmLines.join('\n')}\n\nOnaylarsanız bu farklar "Sayım Düzeltmesi" hareketi olarak kaydedilecek.`,
            'Sayımı Onayla 📦'
        )
        if (!confirmed) return

        const sayimDetails = pendingAdjustments.map(item => `${item.material.name} (${item.currentStock} -> ${item.sayimQty})`)
        const { data: countResult, error: countError } = await supabase.rpc('apply_stock_count', {
            p_items: pendingAdjustments.map(item => ({
                material_id: item.materialId,
                counted_quantity: item.sayimQty
            }))
        })

        if (countError) {
            await showAlert(countError.message || 'Sayım işlemi uygulanırken hata oluştu.', 'error')
            return
        }

        setSayimData({})
        
        await logActivity('Stok', 'GUNCELLEME', 'Son stok sayım tarihi güncellendi.', {
            detay: `Sayım tarihi: ${countResult?.counted_at || new Date().toISOString()}`
        })
        
        fetchData()
        
        await logActivity('Stok', 'GUNCELLEME', `Stok sayım düzeltmesi yapıldı. Farklar ayrı sayım hareketi olarak kaydedildi.`, sayimDetails.length > 0 ? { detay: sayimDetails.join(', ') } : undefined)
        await showAlert(`Sayım tamamlandı! ${countResult?.updated_count || pendingAdjustments.length} ürün için sayım düzeltmesi kaydedildi.`, 'success')
    }

    const criticalMaterials = materials.filter(i => (i.stock_quantity || 0) <= (i.critical_stock_level || 0) && (i.critical_stock_level || 0) > 0)
    const movementTypes = [
        { value: 'giris', label: '📥 Stok Girişi', color: 'text-green-400' },
        { value: 'cikis', label: '📤 Stok Çıkışı', color: 'text-red-400' },
        { value: 'fire', label: '🔥 Fire/Zayi', color: 'text-orange-400' },
    ]

    const handleSayimKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const nextInput = document.getElementById(`sayim-input-${currentIndex + 1}`)
            if (nextInput) {
                nextInput.focus()
                ;(nextInput as HTMLInputElement).select()
            }
        }
    }

    const filteredSayimMaterials = materials.filter(mat => mat.name.toLowerCase().includes(sayimSearchTerm.toLowerCase()))

    const handleMovementSearchChange = (value: string) => {
        setMovementSearchTerm(value)
        setMovementPage(1)
    }

    const handleMovementTypeFilterChange = (value: 'tumu' | 'giris' | 'cikis' | 'fire' | 'sayim') => {
        setMovementTypeFilter(value)
        setMovementPage(1)
    }

    const handleMovementDateFilterChange = (value: 'bugun' | 'bu_hafta' | 'bu_ay' | 'custom' | 'tumu') => {
        setMovementDateFilter(value)
        setMovementPage(1)

        if (value !== 'custom') {
            setMovementStartDate('')
            setMovementEndDate('')
        }
    }

    const handleMovementStartDateChange = async (value: string) => {
        if (movementEndDate && value && value > movementEndDate) {
            await showAlert('Başlangıç tarihi bitiş tarihinden sonra olamaz.', 'warning', 'Geçersiz Tarih Aralığı')
            return
        }

        setMovementStartDate(value)
        setMovementPage(1)
    }

    const handleMovementEndDateChange = async (value: string) => {
        if (movementStartDate && value && value < movementStartDate) {
            await showAlert('Bitiş tarihi başlangıç tarihinden önce olamaz.', 'warning', 'Geçersiz Tarih Aralığı')
            return
        }

        setMovementEndDate(value)
        setMovementPage(1)
    }

    const clearMovementFilters = () => {
        setMovementSearchTerm('')
        setMovementTypeFilter('tumu')
        setMovementDateFilter('bu_ay')
        setMovementStartDate('')
        setMovementEndDate('')
        setMovementPage(1)
    }

    const movementDaysPerPage = 7
    const filteredMovementRows = useMemo(() => {
        return movements.filter(mov => {
            const materialName = mov.materials?.name?.toLowerCase() || ''
            const noteText = mov.note?.toLowerCase() || ''
            const search = movementSearchTerm.trim().toLowerCase()

            const matchesSearch = search.length === 0 || materialName.includes(search) || noteText.includes(search)
            if (!matchesSearch) return false

            const matchesType = movementTypeFilter === 'tumu' || mov.movement_type === movementTypeFilter
            if (!matchesType) return false

            if (movementDateFilter === 'tumu') return true

            const movementDate = new Date(mov.created_at)
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)

            if (movementDateFilter === 'bugun') {
                return movementDate >= todayStart
            }

            if (movementDateFilter === 'bu_hafta') {
                const weekStart = new Date(todayStart)
                weekStart.setDate(weekStart.getDate() - 7)
                return movementDate >= weekStart
            }

            if (movementDateFilter === 'bu_ay') {
                return movementDate.getMonth() === todayStart.getMonth() && movementDate.getFullYear() === todayStart.getFullYear()
            }

            if (movementDateFilter === 'custom') {
                const dateStr = mov.created_at.split('T')[0]
                if (movementStartDate && dateStr < movementStartDate) return false
                if (movementEndDate && dateStr > movementEndDate) return false
            }

            return true
        })
    }, [movements, movementSearchTerm, movementTypeFilter, movementDateFilter, movementStartDate, movementEndDate])

    const groupedMovementRows = useMemo(() => {
        const groups: Array<{ dateKey: string; dateLabel: string; items: Movement[] }> = []
        const toLocalDateKey = (date: Date) => [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-')
        const todayDateObj = new Date()
        const yesterday = new Date(todayDateObj)
        yesterday.setDate(yesterday.getDate() - 1)
        const todayKey = toLocalDateKey(todayDateObj)
        const yesterdayKey = toLocalDateKey(yesterday)

        filteredMovementRows.forEach((mov) => {
            const date = new Date(mov.created_at)
            const dateKey = toLocalDateKey(date)
            const dateLabel = dateKey === todayKey ? 'Bugün' : dateKey === yesterdayKey ? 'Dün' : formatDate(date)
            const existingGroup = groups.find((group) => group.dateKey === dateKey)

            if (existingGroup) {
                existingGroup.items.push(mov)
            } else {
                groups.push({ dateKey, dateLabel, items: [mov] })
            }
        })

        return groups
    }, [filteredMovementRows])

    const totalMovementPages = Math.max(1, Math.ceil(groupedMovementRows.length / movementDaysPerPage))
    const safeMovementPage = Math.min(movementPage, totalMovementPages)
    const paginatedMovementGroups = useMemo(() => {
        return groupedMovementRows.slice((safeMovementPage - 1) * movementDaysPerPage, safeMovementPage * movementDaysPerPage)
    }, [groupedMovementRows, safeMovementPage])
    const visibleMovementCount = paginatedMovementGroups.reduce((total, group) => total + group.items.length, 0)
    const movementSummary = useMemo(() => {
        const countByType = (type: string) => filteredMovementRows.filter(mov => mov.movement_type === type).length
        const giris = countByType('giris')
        const cikis = countByType('cikis')
        const fire = countByType('fire')
        const sayim = countByType('sayim')

        return {
            total: filteredMovementRows.length,
            giris,
            cikis,
            fire,
            sayim,
            control: fire + sayim
        }
    }, [filteredMovementRows])

    const toggleMovementDate = (dateKey: string) => {
        setMovementCollapsedDates(prev => {
            const next = new Set(prev)
            if (next.has(dateKey)) {
                next.delete(dateKey)
            } else {
                next.add(dateKey)
            }
            return next
        })
    }

    const expandAllMovementDates = () => {
        setMovementCollapsedDates(prev => {
            const next = new Set(prev)
            paginatedMovementGroups.forEach(group => next.delete(group.dateKey))
            return next
        })
    }

    const collapseAllMovementDates = () => {
        setMovementCollapsedDates(prev => {
            const next = new Set(prev)
            paginatedMovementGroups.forEach(group => next.add(group.dateKey))
            return next
        })
    }

    const activeMovementFilters = useMemo(() => {
        const filters: string[] = []

        if (movementSearchTerm.trim()) {
            filters.push(`Arama: "${movementSearchTerm.trim()}"`)
        }

        if (movementTypeFilter !== 'tumu') {
            const typeLabelMap = {
                giris: 'Giriş',
                cikis: 'Çıkış',
                fire: 'Fire',
                sayim: 'Sayım'
            }
            filters.push(`Tür: ${typeLabelMap[movementTypeFilter]}`)
        }

        const dateLabelMap = {
            bugun: 'Bugün',
            bu_hafta: 'Son 7 Gün',
            bu_ay: 'Bu Ay',
            tumu: 'Tüm Zamanlar',
            custom: 'Özel Aralık'
        }

        if (movementDateFilter === 'custom') {
            if (movementStartDate || movementEndDate) {
                filters.push(`Tarih: ${movementStartDate || '...'} → ${movementEndDate || '...'}`)
            } else {
                filters.push(`Tarih: ${dateLabelMap[movementDateFilter]}`)
            }
        } else if (movementDateFilter !== 'tumu') {
            filters.push(`Tarih: ${dateLabelMap[movementDateFilter]}`)
        }

        return filters
    }, [movementSearchTerm, movementTypeFilter, movementDateFilter, movementStartDate, movementEndDate])

    const fireMovements = movements.filter(m => m.movement_type === 'fire')
    const sayimMovements = movements.filter(m => m.movement_type === 'sayim')
    
    const filteredZayiMovements = [...fireMovements.filter(m => {
        const matchesSearch = m.materials?.name?.toLowerCase().includes(zayiSearchTerm.toLowerCase()) || 
                              m.note?.toLowerCase().includes(zayiSearchTerm.toLowerCase())
        if (!matchesSearch) return false

        if (zayiDateFilter === 'tumu') return true
        
        const movDate = new Date(m.created_at)
        const todayDateObj = new Date()
        todayDateObj.setHours(0, 0, 0, 0)
        
        if (zayiDateFilter === 'bugun') {
            return movDate >= todayDateObj
        } else if (zayiDateFilter === 'bu_hafta') {
            const lastWeek = new Date(todayDateObj)
            lastWeek.setDate(lastWeek.getDate() - 7)
            return movDate >= lastWeek
        } else if (zayiDateFilter === 'bu_ay') {
            return movDate.getMonth() === todayDateObj.getMonth() && movDate.getFullYear() === todayDateObj.getFullYear()
        }
        return true
    })].sort((a, b) => {
        if (zayiSortBy === 'tarih_yeni') {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        } else if (zayiSortBy === 'tarih_eski') {
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        } else if (zayiSortBy === 'tutar_yuksek') {
            const lossA = a.quantity * (a.unit_price || 0)
            const lossB = b.quantity * (b.unit_price || 0)
            return lossB - lossA
        } else if (zayiSortBy === 'tutar_dusuk') {
            const lossA = a.quantity * (a.unit_price || 0)
            const lossB = b.quantity * (b.unit_price || 0)
            return lossA - lossB
        }
        return 0
    })

    const totalZayiMaliyeti = filteredZayiMovements.reduce((t, m) => t + (m.quantity * (m.unit_price || 0)), 0)

    const zayiAnalysis: Record<string, number> = {}
    filteredZayiMovements.forEach(m => {
        const name = m.materials?.name || 'Bilinmeyen'
        const loss = m.quantity * (m.unit_price || 0)
        zayiAnalysis[name] = (zayiAnalysis[name] || 0) + loss
    })
    const topZayiProducts = Object.entries(zayiAnalysis)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)

    const groupedZayiMovements = useMemo(() => {
        const groups: Record<string, typeof filteredZayiMovements> = {}
        const todayDateObj2 = new Date()
        const yesterday = new Date(todayDateObj2)
        yesterday.setDate(yesterday.getDate() - 1)

        filteredZayiMovements.forEach(log => {
            const date = new Date(log.created_at)
            let dateKey = formatDate(date)
            
            if (date.toDateString() === todayDateObj2.toDateString()) {
                dateKey = 'Bugün'
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateKey = 'Dün'
            }

            if (!groups[dateKey]) {
                groups[dateKey] = []
            }
            groups[dateKey].push(log)
        })
        return groups
    }, [filteredZayiMovements])

    const toggleZayiDate = (dateKey: string) => {
        setZayiExpandedDates(prev => prev.includes(dateKey) ? prev.filter(d => d !== dateKey) : [...prev, dateKey])
    }

    // Sayım Uyarı Hesaplamaları
    const todayForCount = new Date()
    const isCountDay = todayForCount.getDate() === inventoryCountDay
    
    let daysSinceLastCount = null
    if (lastCountDate) {
        const d1 = new Date(todayForCount.getFullYear(), todayForCount.getMonth(), todayForCount.getDate())
        const d2 = new Date(lastCountDate.getFullYear(), lastCountDate.getMonth(), lastCountDate.getDate())
        daysSinceLastCount = Math.floor((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24))
    }
    const isDelayed = daysSinceLastCount !== null && daysSinceLastCount > 30

    return (
        <div className="min-h-full bg-stone-950 text-white">

            {/* Header */}
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">📦</span>
                    <h1 className="font-bold text-amber-400">Stok Takibi</h1>
                </div>
                <button
                    onClick={() => setShowForm(true)}
                    className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
                >
                    + Stok Hareketi
                </button>
            </header>

            <main className="p-6">

                {/* Sayım Günü ve Gecikme Uyarıları */}
                {isCountDay && (
                    <div className="bg-amber-900/30 border border-amber-500 rounded-xl p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">🔔</span>
                            <div>
                                <h3 className="font-bold text-amber-400">Bugün Sayım Günü!</h3>
                                <p className="text-stone-300 text-sm">Ayarlarınızda belirlenen aylık sayım günü geldi. Lütfen sayım sekmesinden stoklarınızı güncelleyin.</p>
                            </div>
                        </div>
                        <button onClick={() => setActiveTab('sayim')} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap">
                            Hemen Sayım Yap
                        </button>
                    </div>
                )}

                {isDelayed && !isCountDay && (
                    <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 mb-6 flex items-center gap-3">
                        <span className="text-3xl">🚨</span>
                        <div>
                            <h3 className="font-bold text-red-400">Sayım Gecikmesi Tespit Edildi!</h3>
                            <p className="text-stone-300 text-sm">Son sayımınızın üzerinden <strong>{daysSinceLastCount} gün</strong> geçmiş. Teorik stoklarınız gerçeği yansıtmıyor olabilir, acilen sayım yapmanız önerilir.</p>
                        </div>
                    </div>
                )}

                {/* Kritik Stok Uyarısı */}
                {criticalMaterials.length > 0 && (
                    <div className="bg-red-900/30 border border-red-500 rounded-xl p-4 mb-6">
                        <h3 className="font-bold text-red-400 mb-2">🚨 Kritik Stok Uyarısı</h3>
                        <div className="flex flex-wrap gap-2">
                            {criticalMaterials.map(mat => (
                                <span key={mat.id} className="bg-red-900/50 text-red-300 px-3 py-1 rounded-full text-sm">
                                    {mat.name}: {mat.stock_quantity || 0} {mat.unit} kaldı
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Hareket Formu */}
                {showForm && (
                    <div className="bg-stone-900 border border-amber-400 rounded-xl p-6 mb-6">
                        <h2 className="font-bold text-lg mb-4">Stok Hareketi Ekle</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Hammadde *</label>
                                <select
                                    value={form.material_id}
                                    onChange={e => setForm({ ...form, material_id: e.target.value })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                >
                                    <option value="">Seçin</option>
                                    {materials.map(i => (
                                        <option key={i.id} value={i.id}>
                                            {i.name} (Mevcut: {i.stock_quantity || 0} {i.unit})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Hareket Türü</label>
                                <select
                                    value={form.movement_type}
                                    onChange={e => setForm({ ...form, movement_type: e.target.value })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                >
                                    {movementTypes.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Miktar *</label>
                                <input
                                    type="number"
                                    value={form.quantity}
                                    onChange={e => setForm({ ...form, quantity: e.target.value })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                    placeholder="0"
                                />
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Birim Fiyat (₺) — opsiyonel</label>
                                <input
                                    type="number"
                                    value={form.unit_price}
                                    onChange={e => setForm({ ...form, unit_price: e.target.value })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                    placeholder="Boş bırakırsanız kayıtlı fiyat kullanılır"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-stone-400 text-sm mb-1 block">Not</label>
                                <input
                                    value={form.note}
                                    onChange={e => setForm({ ...form, note: e.target.value })}
                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                                    placeholder="örn: Metro'dan alındı"
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={handleMovement}
                                className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2 rounded-lg transition-colors"
                            >
                                Kaydet
                            </button>
                            <button
                                onClick={() => setShowForm(false)}
                                className="bg-stone-700 hover:bg-stone-600 text-white px-6 py-2 rounded-lg transition-colors"
                            >
                                İptal
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                    {[
                        { key: 'stok', label: '📦 Stok Durumu' },
                        { key: 'hareket', label: '📋 Hareketler' },
                        { key: 'sayim', label: '🔢 Sayım Yap' },
                        { key: 'zayi', label: '🔥 Fire/Zayi (TL)' }
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as any)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors whitespace-nowrap ${activeTab === tab.key ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-400 hover:text-white'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {loading ? <p className="text-stone-400">Yükleniyor...</p> : (
                    <>
                        {/* Stok Durumu */}
                        {activeTab === 'stok' && (
                            <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
                                <div className="overflow-x-auto w-full">
<table className="w-full">
                                    <thead>
                                        <tr className="border-b border-stone-800">
                                            <th className="text-left px-4 py-3 text-stone-400 text-sm">Hammadde</th>
                                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Mevcut Stok</th>
                                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Kritik Seviye</th>
                                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Stok Değeri</th>
                                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Durum</th>
                                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Hızlı İşlem</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {materials.map(mat => {
                                            const isCritical = (mat.stock_quantity || 0) <= (mat.critical_stock_level || 0) && (mat.critical_stock_level || 0) > 0
                                            const stockValue = (mat.stock_quantity || 0) * mat.price_per_unit
                                            return (
                                                <Fragment key={mat.id}>
                                                    <tr className={`border-b border-stone-800 hover:bg-stone-800 transition-colors ${inlineMovementMatId === mat.id ? 'bg-amber-900/10' : ''}`}>
                                                        <td className="px-4 py-3 font-medium">{mat.name}</td>
                                                        <td className={`px-4 py-3 text-right font-bold ${isCritical ? 'text-red-400' : 'text-green-400'}`}>
                                                            {mat.stock_quantity || 0} {mat.unit}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-stone-400">
                                                            {mat.critical_stock_level || 0} {mat.unit}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-amber-400">{formatCurrency(stockValue)}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            {isCritical
                                                                ? <span className="text-red-400 text-sm">🚨 Kritik</span>
                                                                : <span className="text-green-400 text-sm">✓ Normal</span>
                                                            }
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button 
                                                                    onClick={() => { setInlineMovementMatId(mat.id); setInlineMovementType('giris'); setInlineForm({ quantity: '', unit_price: '', note: '' }); }}
                                                                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${inlineMovementMatId === mat.id && inlineMovementType === 'giris' ? 'bg-green-500 text-stone-950' : 'bg-green-900/30 text-green-400 hover:bg-green-900/50'}`}
                                                                >
                                                                    📥 Giriş
                                                                </button>
                                                                <button 
                                                                    onClick={() => { setInlineMovementMatId(mat.id); setInlineMovementType('cikis'); setInlineForm({ quantity: '', unit_price: '', note: '' }); }}
                                                                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${inlineMovementMatId === mat.id && inlineMovementType === 'cikis' ? 'bg-red-500 text-stone-950' : 'bg-red-900/30 text-red-400 hover:bg-red-900/50'}`}
                                                                >
                                                                    📤 Çıkış
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {inlineMovementMatId === mat.id && (
                                                        <tr>
                                                            <td colSpan={6} className="p-4 bg-stone-950/80 border-b-2 border-amber-500/40">
                                                                <div className="bg-stone-900 border border-amber-400/60 rounded-xl p-5">
                                                                    <div className="flex items-center justify-between mb-4">
                                                                        <h3 className={`font-bold ${inlineMovementType === 'giris' ? 'text-green-400' : 'text-red-400'}`}>
                                                                            {inlineMovementType === 'giris' ? '📥 Stok Girişi: ' : '📤 Stok Çıkışı: '} {mat.name}
                                                                        </h3>
                                                                        <button onClick={() => setInlineMovementMatId(null)} className="text-stone-500 hover:text-white text-lg">✕</button>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                                                        <div>
                                                                            <label className="text-stone-400 text-xs mb-1 block">Miktar ({mat.unit}) *</label>
                                                                            <input 
                                                                                type="number" 
                                                                                value={inlineForm.quantity} 
                                                                                onChange={e => setInlineForm({ ...inlineForm, quantity: e.target.value })} 
                                                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" 
                                                                                placeholder="0" 
                                                                            />
                                                                        </div>
                                                                        <div>
                                                                            <label className="text-stone-400 text-xs mb-1 block">Birim Fiyat (₺) (Opsiyonel)</label>
                                                                            <input 
                                                                                type="number" 
                                                                                value={inlineForm.unit_price} 
                                                                                onChange={e => setInlineForm({ ...inlineForm, unit_price: e.target.value })} 
                                                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" 
                                                                                placeholder={mat.price_per_unit.toString()} 
                                                                            />
                                                                        </div>
                                                                        <div className="md:col-span-2">
                                                                            <label className="text-stone-400 text-xs mb-1 block">Not</label>
                                                                            <input 
                                                                                value={inlineForm.note} 
                                                                                onChange={e => setInlineForm({ ...inlineForm, note: e.target.value })} 
                                                                                className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" 
                                                                                placeholder="Açıklama (opsiyonel)" 
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-3 mt-4">
                                                                        <button 
                                                                            onClick={handleInlineSubmit} 
                                                                            className={`font-bold px-5 py-2 rounded-lg text-sm text-stone-950 ${inlineMovementType === 'giris' ? 'bg-green-500 hover:bg-green-400' : 'bg-red-500 hover:bg-red-400'}`}
                                                                        >
                                                                            Kaydet
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => setInlineMovementMatId(null)} 
                                                                            className="bg-stone-700 hover:bg-stone-600 text-white px-5 py-2 rounded-lg text-sm"
                                                                        >
                                                                            İptal
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-stone-800">
                                            <td colSpan={3} className="px-4 py-3 font-bold text-stone-300">Toplam Stok Değeri</td>
                                            <td className="px-4 py-3 text-right font-bold text-amber-400">{formatCurrency(materials.reduce((t, i) => t + (i.stock_quantity || 0) * i.price_per_unit, 0))}
                                            </td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
</div>
                            </div>
                        )}

                        {/* Hareketler */}
                        {activeTab === 'hareket' && (
                            <div className="space-y-5">
                                <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                                    <div>
                                        <p className="text-amber-400 text-xs font-bold uppercase tracking-[0.2em] mb-1">Operasyon Geçmişi</p>
                                        <h2 className="text-xl font-bold text-white">Stok Hareketleri</h2>
                                        <p className="text-stone-400 text-sm mt-1">Giriş, çıkış, fire ve sayım düzeltmelerini seçili dönem üzerinden izleyin.</p>
                                    </div>
                                    <div className="text-xs text-stone-500 bg-stone-900 border border-stone-800 rounded-lg px-3 py-2">
                                        Kayıtlar gün bazında gruplanır · Sayfa başına {movementDaysPerPage} gün
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                                    <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 min-h-28 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-stone-500 text-xs font-bold uppercase tracking-wider">Toplam Hareket</p>
                                            <p className="text-3xl font-black text-white mt-2">{movementSummary.total}</p>
                                            <p className="text-stone-500 text-xs mt-1">{groupedMovementRows.length} farklı gün</p>
                                        </div>
                                        <span className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl">📋</span>
                                    </div>
                                    <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 min-h-28 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-stone-500 text-xs font-bold uppercase tracking-wider">Stok Girişi</p>
                                            <p className="text-3xl font-black text-green-400 mt-2">{movementSummary.giris}</p>
                                            <p className="text-stone-500 text-xs mt-1">Seçili dönemde</p>
                                        </div>
                                        <span className="w-11 h-11 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-xl">📥</span>
                                    </div>
                                    <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 min-h-28 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-stone-500 text-xs font-bold uppercase tracking-wider">Stok Çıkışı</p>
                                            <p className="text-3xl font-black text-red-400 mt-2">{movementSummary.cikis}</p>
                                            <p className="text-stone-500 text-xs mt-1">Seçili dönemde</p>
                                        </div>
                                        <span className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-xl">📤</span>
                                    </div>
                                    <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 min-h-28 flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-stone-500 text-xs font-bold uppercase tracking-wider">Kontrol Hareketi</p>
                                            <p className="text-3xl font-black text-blue-400 mt-2">{movementSummary.control}</p>
                                            <p className="text-stone-500 text-xs mt-1">{movementSummary.fire} fire · {movementSummary.sayim} sayım</p>
                                        </div>
                                        <span className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-xl">🧭</span>
                                    </div>
                                </div>

                                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-4 shadow-sm shadow-black/20">
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                                        <div className="lg:col-span-6">
                                            <label className="text-stone-500 text-xs font-bold mb-1.5 block">ARAMA</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500">🔍</span>
                                                <input
                                                    type="text"
                                                    placeholder="Hammadde adı veya hareket notu..."
                                                    value={movementSearchTerm}
                                                    onChange={(e) => handleMovementSearchChange(e.target.value)}
                                                    className="w-full h-11 bg-stone-800 border border-stone-700 rounded-lg pl-9 pr-4 text-white text-sm focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                        </div>
                                        <div className="lg:col-span-3">
                                            <label className="text-stone-500 text-xs font-bold mb-1.5 block">HAREKET TÜRÜ</label>
                                            <select
                                                value={movementTypeFilter}
                                                onChange={(e) => handleMovementTypeFilterChange(e.target.value as 'tumu' | 'giris' | 'cikis' | 'fire' | 'sayim')}
                                                className="w-full h-11 bg-stone-800 border border-stone-700 text-stone-300 text-sm rounded-lg px-3 focus:outline-none focus:border-amber-400"
                                            >
                                                <option value="tumu">Tüm Hareketler</option>
                                                <option value="giris">Stok Girişi</option>
                                                <option value="cikis">Stok Çıkışı</option>
                                                <option value="fire">Fire / Zayi</option>
                                                <option value="sayim">Sayım Düzeltmesi</option>
                                            </select>
                                        </div>
                                        <div className="lg:col-span-3">
                                            <label className="text-stone-500 text-xs font-bold mb-1.5 block">TARİH ARALIĞI</label>
                                            <select
                                                value={movementDateFilter}
                                                onChange={(e) => handleMovementDateFilterChange(e.target.value as 'bugun' | 'bu_hafta' | 'bu_ay' | 'custom' | 'tumu')}
                                                className="w-full h-11 bg-stone-800 border border-stone-700 text-stone-300 text-sm rounded-lg px-3 focus:outline-none focus:border-amber-400"
                                            >
                                                <option value="bugun">Bugün</option>
                                                <option value="bu_hafta">Son 7 Gün</option>
                                                <option value="bu_ay">Bu Ay</option>
                                                <option value="custom">Özel Tarih Aralığı</option>
                                                <option value="tumu">Tüm Zamanlar</option>
                                            </select>
                                        </div>
                                    </div>

                                    {movementDateFilter === 'custom' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-stone-400 text-xs mb-1 block">Başlangıç Tarihi</label>
                                                <input
                                                    type="date"
                                                    value={movementStartDate}
                                                    onChange={(e) => void handleMovementStartDateChange(e.target.value)}
                                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-stone-400 text-xs mb-1 block">Bitiş Tarihi</label>
                                                <input
                                                    type="date"
                                                    value={movementEndDate}
                                                    onChange={(e) => void handleMovementEndDateChange(e.target.value)}
                                                    className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm">
                                        <div className="space-y-2">
                                            <p className="text-stone-400">
                                                {filteredMovementRows.length === 0
                                                    ? 'Seçili kriterlerde hareket bulunamadı.'
                                                    : `${filteredMovementRows.length} hareket, ${groupedMovementRows.length} gün içinde bulundu.`}
                                            </p>
                                            {activeMovementFilters.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {activeMovementFilters.map((filter) => (
                                                        <span key={filter} className="bg-stone-800 text-stone-300 px-3 py-1 rounded-full border border-stone-700 text-xs">
                                                            {filter}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-stone-500 text-xs">Aktif filtre yok. Tüm hareketler listeleniyor.</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={clearMovementFilters}
                                            className="bg-stone-800 hover:bg-stone-700 text-stone-200 px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700"
                                        >
                                            Filtreleri Temizle
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
                                        <div>
                                            <h3 className="font-bold text-stone-200">Günlük Hareket Akışı</h3>
                                            <p className="text-stone-500 text-xs mt-0.5">Bu sayfada {paginatedMovementGroups.length} gün ve {visibleMovementCount} hareket gösteriliyor.</p>
                                        </div>
                                        {paginatedMovementGroups.length > 0 && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={expandAllMovementDates}
                                                    className="bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                                                >
                                                    Tümünü Aç
                                                </button>
                                                <button
                                                    onClick={collapseAllMovementDates}
                                                    className="bg-stone-900 hover:bg-stone-800 text-stone-300 border border-stone-800 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                                                >
                                                    Tümünü Kapat
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {filteredMovementRows.length === 0 ? (
                                        <div className="bg-stone-900 rounded-xl border border-stone-800 p-8 text-center text-stone-500">
                                            Seçili filtrelere uygun hareket bulunamadı.
                                        </div>
                                    ) : (
                                        paginatedMovementGroups.map(({ dateKey, dateLabel, items }) => {
                                            const isExpanded = !movementCollapsedDates.has(dateKey)
                                            const daySummary = items.reduce((summary, mov) => {
                                                if (mov.movement_type === 'giris') summary.giris += 1
                                                if (mov.movement_type === 'cikis') summary.cikis += 1
                                                if (mov.movement_type === 'fire') summary.fire += 1
                                                if (mov.movement_type === 'sayim') summary.sayim += 1
                                                return summary
                                            }, { giris: 0, cikis: 0, fire: 0, sayim: 0 })

                                            return (
                                                <div key={dateKey} className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
                                                    <button
                                                        onClick={() => toggleMovementDate(dateKey)}
                                                        className="w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-5 py-4 bg-stone-800/30 hover:bg-stone-800/50 transition-colors text-left"
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="w-10 h-10 shrink-0 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center text-lg">
                                                                {dateLabel === 'Bugün' ? '📅' : dateLabel === 'Dün' ? '⏱️' : '🗓️'}
                                                            </span>
                                                            <div>
                                                                <h3 className="font-bold text-stone-100">{dateLabel}</h3>
                                                                <p className="text-stone-500 text-xs mt-0.5">{items.length} stok hareketi</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between lg:justify-end gap-2 w-full lg:w-auto">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {daySummary.giris > 0 && <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-1 rounded-md text-xs">+{daySummary.giris} giriş</span>}
                                                                {daySummary.cikis > 0 && <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-md text-xs">−{daySummary.cikis} çıkış</span>}
                                                                {daySummary.fire > 0 && <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-md text-xs">{daySummary.fire} fire</span>}
                                                                {daySummary.sayim > 0 && <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-1 rounded-md text-xs">{daySummary.sayim} sayım</span>}
                                                            </div>
                                                            <span className="text-stone-400 text-sm font-bold bg-stone-800 border border-stone-700 w-9 h-9 shrink-0 flex items-center justify-center rounded-lg">{isExpanded ? '▲' : '▼'}</span>
                                                        </div>
                                                    </button>

                                                    {isExpanded && (
                                                        <div className="overflow-x-auto border-t border-stone-800">
                                                            <div className="overflow-x-auto w-full">
<table className="w-full">
                                                                <thead>
                                                                    <tr className="border-b border-stone-800 bg-stone-950/30">
                                                                        <th className="text-left px-5 py-3 text-stone-500 text-xs font-bold uppercase tracking-wider">Saat</th>
                                                                        <th className="text-left px-5 py-3 text-stone-500 text-xs font-bold uppercase tracking-wider">Hammadde</th>
                                                                        <th className="text-left px-5 py-3 text-stone-500 text-xs font-bold uppercase tracking-wider">Hareket</th>
                                                                        <th className="text-right px-5 py-3 text-stone-500 text-xs font-bold uppercase tracking-wider">Miktar</th>
                                                                        <th className="text-right px-5 py-3 text-stone-500 text-xs font-bold uppercase tracking-wider">Birim Fiyat</th>
                                                                        <th className="text-left px-5 py-3 text-stone-500 text-xs font-bold uppercase tracking-wider">Açıklama</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {items.map(mov => {
                                                                        const typeConfig = {
                                                                            giris: { label: 'Giriş', icon: '📥', badge: 'bg-green-500/10 text-green-400 border-green-500/20', quantity: 'text-green-400', sign: '+' },
                                                                            cikis: { label: 'Çıkış', icon: '📤', badge: 'bg-red-500/10 text-red-400 border-red-500/20', quantity: 'text-red-400', sign: '−' },
                                                                            fire: { label: 'Fire', icon: '🔥', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20', quantity: 'text-orange-400', sign: '−' },
                                                                            sayim: { label: 'Sayım', icon: '🔢', badge: 'bg-blue-500/10 text-blue-400 border-blue-500/20', quantity: 'text-blue-400', sign: '±' }
                                                                        }[mov.movement_type] || { label: mov.movement_type, icon: '•', badge: 'bg-stone-800 text-stone-400 border-stone-700', quantity: 'text-stone-300', sign: '' }
                                                                        const quantity = Number(mov.quantity) || 0
                                                                        const quantitySign = mov.movement_type === 'sayim'
                                                                            ? quantity > 0 ? '+' : quantity < 0 ? '−' : ''
                                                                            : typeConfig.sign

                                                                        return (
                                                                            <tr key={mov.id} className="border-b border-stone-800/80 hover:bg-stone-800/60 transition-colors">
                                                                                <td className="px-5 py-4 text-stone-400 text-sm font-mono whitespace-nowrap">
                                                                                    {new Date(mov.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                                                </td>
                                                                                <td className="px-5 py-4 min-w-52">
                                                                                    <p className="font-medium text-stone-100">{mov.materials?.name || 'Bilinmeyen hammadde'}</p>
                                                                                    {!mov.materials && <p className="text-red-400 text-xs mt-1">Hammadde bağlantısı bulunamadı</p>}
                                                                                </td>
                                                                                <td className="px-5 py-4">
                                                                                    <span className={`inline-flex items-center gap-1.5 border px-2.5 py-1 rounded-lg text-xs font-bold ${typeConfig.badge}`}>
                                                                                        <span>{typeConfig.icon}</span>
                                                                                        {typeConfig.label}
                                                                                    </span>
                                                                                </td>
                                                                                <td className={`px-5 py-4 text-right font-black whitespace-nowrap ${typeConfig.quantity}`}>
                                                                                    {quantitySign}{Math.abs(quantity)} {mov.materials?.unit || ''}
                                                                                </td>
                                                                                <td className="px-5 py-4 text-right text-stone-300 whitespace-nowrap">
                                                                                    {mov.unit_price ? formatCurrency(mov.unit_price) : '—'}
                                                                                </td>
                                                                                <td className="px-5 py-4 text-stone-400 text-sm min-w-56">
                                                                                    {mov.note || <span className="text-stone-600">Açıklama girilmemiş</span>}
                                                                                </td>
                                                                            </tr>
                                                                        )
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })
                                    )}

                                    {filteredMovementRows.length > 0 && (
                                        <div className="bg-stone-900 rounded-xl border border-stone-800 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                            <div className="text-sm text-stone-400">
                                                {((safeMovementPage - 1) * movementDaysPerPage) + 1} - {Math.min(safeMovementPage * movementDaysPerPage, groupedMovementRows.length)} / {groupedMovementRows.length} gün · {visibleMovementCount} hareket
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setMovementPage(prev => Math.max(1, prev - 1))}
                                                    disabled={safeMovementPage === 1}
                                                    className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 disabled:hover:bg-stone-800 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700"
                                                >
                                                    ← Önceki
                                                </button>
                                                <span className="text-sm text-stone-300 px-3 py-2 bg-stone-800 rounded-lg border border-stone-700">
                                                    Sayfa {safeMovementPage} / {totalMovementPages}
                                                </span>
                                                <button
                                                    onClick={() => setMovementPage(prev => Math.min(totalMovementPages, prev + 1))}
                                                    disabled={safeMovementPage === totalMovementPages}
                                                    className="bg-stone-800 hover:bg-stone-700 disabled:opacity-50 disabled:hover:bg-stone-800 text-white px-4 py-2 rounded-lg text-sm transition-colors border border-stone-700"
                                                >
                                                    Sonraki →
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Sayım */}
                        {activeTab === 'sayim' && (
                            <div className="space-y-4">
                                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <p className="text-stone-400 text-sm">
                                        Gerçek stok miktarlarını girin. Hızlı sayım için rakamı yazıp <kbd className="bg-stone-800 px-2 py-1 rounded text-stone-300 font-mono text-xs mx-1">Enter</kbd> tuşu ile alt satıra geçebilirsiniz.
                                    </p>
                                    <div className="relative w-full md:w-72">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500">🔍</span>
                                        <input 
                                            type="text"
                                            placeholder="Hammadde Ara..."
                                            value={sayimSearchTerm}
                                            onChange={(e) => setSayimSearchTerm(e.target.value)}
                                            className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                                        />
                                    </div>
                                </div>
                                <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
                                    <div className="overflow-x-auto w-full">
<table className="w-full">
                                        <thead>
                                            <tr className="border-b border-stone-800">
                                                <th className="text-left px-4 py-3 text-stone-400 text-sm">Hammadde</th>
                                                <th className="text-right px-4 py-3 text-stone-400 text-sm">Teorik Stok</th>
                                                <th className="text-right px-4 py-3 text-stone-400 text-sm w-40">Gerçek Sayım</th>
                                                <th className="text-right px-4 py-3 text-stone-400 text-sm">Fark</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredSayimMaterials.length === 0 ? (
                                                <tr><td colSpan={4} className="text-center py-6 text-stone-500">Aramanıza uygun hammadde bulunamadı.</td></tr>
                                            ) : filteredSayimMaterials.map((mat, index) => {
                                                const actual = sayimData[mat.id] ? parseFloat(sayimData[mat.id]) : null
                                                const currentStock = mat.stock_quantity || 0
                                                const diff = actual !== null ? actual - currentStock : null
                                                return (
                                                    <tr key={mat.id} className={`border-b border-stone-800 transition-colors ${actual !== null ? 'bg-amber-900/10' : 'hover:bg-stone-800'}`}>
                                                        <td className="px-4 py-3 font-medium">
                                                            {mat.name}
                                                            {actual !== null && <span className="ml-2 text-green-500 text-xs">✓</span>}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-stone-400">
                                                            {currentStock} {mat.unit}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <input
                                                                id={`sayim-input-${index}`}
                                                                type="number"
                                                                value={sayimData[mat.id] || ''}
                                                                onChange={e => setSayimData(prev => ({ ...prev, [mat.id]: e.target.value }))}
                                                                onKeyDown={e => handleSayimKeyDown(e, index)}
                                                                className="w-28 bg-stone-800 border border-stone-600 rounded px-3 py-2 text-white text-right font-bold focus:outline-none focus:border-amber-400 focus:bg-stone-700 transition-colors"
                                                                placeholder={currentStock.toString()}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            {diff !== null && (
                                                                <span className={`font-bold px-2 py-1 rounded text-xs ${diff < 0 ? 'bg-red-900/30 text-red-400 border border-red-500/20' : diff > 0 ? 'bg-green-900/30 text-green-400 border border-green-500/20' : 'text-stone-500'}`}>
                                                                    {diff > 0 ? '+' : ''}{diff.toFixed(2)} {mat.unit}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
</div>
                                </div>
                                <button
                                    onClick={handleSayim}
                                    disabled={Object.keys(sayimData).length === 0}
                                    className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                                >
                                    Sayımı Tamamla & Kaydet
                                </button>
                            </div>
                        )}

                        {/* Fire ve Zayi Analizi */}
                        {activeTab === 'zayi' && (
                            <div className="space-y-6">
                                <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="font-bold text-stone-200">Gerçek Fire / Zayi Analizi</h3>
                                        <p className="text-stone-400 text-sm">Bu analiz yalnızca gerçek <code className="text-orange-300">fire</code> kayıtlarını içerir. <code className="text-blue-300">sayim</code> düzeltmeleri bu tabloya dahil edilmez.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        <span className="bg-orange-900/30 text-orange-300 px-3 py-1 rounded-full border border-orange-500/20">Analizde {filteredZayiMovements.length} fire kaydı</span>
                                        <span className="bg-blue-900/30 text-blue-300 px-3 py-1 rounded-full border border-blue-500/20">Hariç tutulan {sayimMovements.length} sayım hareketi</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 flex flex-col justify-center">
                                        <h3 className="font-bold text-red-400 text-lg mb-1">Toplam Fire Maliyeti</h3>
                                        <p className="text-stone-400 text-xs mb-4">Seçili dönemdeki toplam maddi kayıp</p>
                                        <div className="text-4xl font-black text-red-400">{formatCurrency(totalZayiMaliyeti)}
                                        </div>
                                    </div>
                                    
                                    <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 md:col-span-2">
                                        <h3 className="font-bold text-stone-300 text-lg mb-4">🚨 En Çok Zarar Ettiren 3 Ürün</h3>
                                        {topZayiProducts.length === 0 ? (
                                            <p className="text-stone-500 text-sm">Bu dönemde fire veren ürün yok. Harika!</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {topZayiProducts.map((p, idx) => (
                                                    <div key={idx} className="flex items-center justify-between bg-stone-800/50 px-4 py-2 rounded-lg border border-stone-800">
                                                        <div className="flex items-center gap-3">
                                                            <span className="bg-stone-950 text-stone-500 font-bold w-6 h-6 flex items-center justify-center rounded-md text-xs">{idx + 1}</span>
                                                            <span className="font-medium text-stone-200">{p.name}</span>
                                                        </div>
                                                        <span className="font-bold text-red-400">{formatCurrency(p.total)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Kontrol Çubuğu */}
                                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-stone-900 p-4 rounded-xl border border-stone-800">
                                    <div className="relative w-full md:w-96">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500">🔍</span>
                                        <input 
                                            type="text"
                                            placeholder="Hammadde veya Not Ara..."
                                            value={zayiSearchTerm}
                                            onChange={(e) => setZayiSearchTerm(e.target.value)}
                                            className="w-full bg-stone-800 border border-stone-700 rounded-lg pl-9 pr-4 py-2 text-white text-sm focus:outline-none focus:border-red-400"
                                        />
                                    </div>
                                    <div className="flex w-full md:w-auto gap-2">
                                        <select 
                                            value={zayiDateFilter}
                                            onChange={e => setZayiDateFilter(e.target.value as any)}
                                            className="flex-1 md:flex-none bg-stone-800 border border-stone-700 text-stone-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-red-400"
                                        >
                                            <option value="bugun">Bugün</option>
                                            <option value="bu_hafta">Son 7 Gün</option>
                                            <option value="bu_ay">Bu Ay</option>
                                            <option value="tumu">Tüm Zamanlar</option>
                                        </select>
                                        <select 
                                            value={zayiSortBy}
                                            onChange={e => setZayiSortBy(e.target.value as any)}
                                            className="flex-1 md:flex-none bg-stone-800 border border-stone-700 text-stone-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-red-400"
                                        >
                                            <option value="tarih_yeni">Tarih (Yeniye)</option>
                                            <option value="tarih_eski">Tarih (Eskiye)</option>
                                            <option value="tutar_yuksek">En Yüksek Zarar</option>
                                            <option value="tutar_dusuk">En Düşük Zarar</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="font-bold text-stone-300">Fire Hareketleri Detayı</h3>
                                        <span className="text-xs font-bold bg-stone-800 text-stone-400 px-2 py-1 rounded">{filteredZayiMovements.length} Kayıt</span>
                                    </div>
                                    
                                    {Object.keys(groupedZayiMovements).length === 0 ? (
                                        <div className="bg-stone-900 border border-stone-800 rounded-xl p-8 text-center text-stone-500">
                                            Seçili kriterlerde fire kaydı bulunamadı.
                                        </div>
                                    ) : (
                                        (zayiSortBy === 'tarih_yeni' || zayiSortBy === 'tarih_eski') ? (
                                            Object.entries(groupedZayiMovements).map(([dateKey, groupLogs]) => {
                                                const isExpanded = zayiExpandedDates.includes(dateKey)
                                                return (
                                                    <div key={dateKey} className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
                                                        <button 
                                                            onClick={() => toggleZayiDate(dateKey)}
                                                            className="w-full flex items-center justify-between px-6 py-4 bg-stone-800/30 hover:bg-stone-800/50 transition-colors"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-lg">{dateKey === 'Bugün' ? '📅' : dateKey === 'Dün' ? '⏱️' : '🗓️'}</span>
                                                                <h3 className="font-bold text-stone-200">{dateKey}</h3>
                                                                <span className="bg-stone-800 text-xs px-2 py-1 rounded-full text-stone-400 border border-stone-700">{groupLogs.length} hareket</span>
                                                            </div>
                                                            <span className="text-stone-500 text-sm font-bold bg-stone-800 w-8 h-8 flex items-center justify-center rounded-lg">{isExpanded ? '▲' : '▼'}</span>
                                                        </button>
                                                        
                                                        {isExpanded && (
                                                            <div className="overflow-x-auto border-t border-stone-800">
                                                                <div className="overflow-x-auto w-full">
<table className="w-full text-left">
                                                                    <thead className="bg-stone-800/20 text-stone-500 text-xs uppercase tracking-wider border-b border-stone-800">
                                                                        <tr>
                                                                            <th className="px-6 py-3 font-medium">Saat</th>
                                                                            <th className="px-6 py-3 font-medium">Hammadde</th>
                                                                            <th className="px-6 py-3 font-medium text-right">Fire Miktarı</th>
                                                                            <th className="px-6 py-3 font-medium text-right">Birim Fiyat</th>
                                                                            <th className="px-6 py-3 font-medium text-right">Zarar</th>
                                                                            <th className="px-6 py-3 font-medium">Açıklama</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-stone-800/50">
                                                                        {groupLogs.map(mov => {
                                                                            const loss = mov.quantity * (mov.unit_price || 0);
                                                                            return (
                                                                                <tr key={mov.id} className="hover:bg-stone-800/40 transition-colors">
                                                                                    <td className="px-6 py-4 text-sm text-stone-400 whitespace-nowrap">
                                                                                        {formatDate(new Date(mov.created_at))}
                                                                                    </td>
                                                                                    <td className="px-6 py-4 font-medium">
                                                                                        {mov.materials?.name}
                                                                                    </td>
                                                                                    <td className="px-6 py-4 text-right">
                                                                                        <span className="bg-stone-800 text-stone-300 px-2 py-1 rounded text-xs border border-stone-700">
                                                                                            {mov.quantity} {mov.materials?.unit}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="px-6 py-4 text-right text-stone-400 text-sm">
                                                                                        ₺{(mov.unit_price || 0).toFixed(2)}
                                                                                    </td>
                                                                                    <td className="px-6 py-4 text-right">
                                                                                        <span className="text-red-400 font-bold bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
                                                                                            ₺{loss.toFixed(2)}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="px-6 py-4 text-stone-400 text-sm">{mov.note}</td>
                                                                                </tr>
                                                                            )
                                                                        })}
                                                                    </tbody>
                                                                </table>
</div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })
                                        ) : (
                                            <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left">
                                                        <thead className="bg-stone-800/20 text-stone-500 text-xs uppercase tracking-wider border-b border-stone-800">
                                                            <tr>
                                                                <th className="px-6 py-3 font-medium">Tarih</th>
                                                                <th className="px-6 py-3 font-medium">Hammadde</th>
                                                                <th className="px-6 py-3 font-medium text-right">Fire Miktarı</th>
                                                                <th className="px-6 py-3 font-medium text-right">Birim Fiyat</th>
                                                                <th className="px-6 py-3 font-medium text-right">Zarar</th>
                                                                <th className="px-6 py-3 font-medium">Açıklama</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-stone-800/50">
                                                            {filteredZayiMovements.map(mov => {
                                                                const loss = mov.quantity * (mov.unit_price || 0);
                                                                return (
                                                                    <tr key={mov.id} className="hover:bg-stone-800/40 transition-colors">
                                                                        <td className="px-6 py-4 text-sm text-stone-400 whitespace-nowrap">
                                                                            {formatDate(new Date(mov.created_at))}
                                                                        </td>
                                                                        <td className="px-6 py-4 font-medium">
                                                                            {mov.materials?.name}
                                                                        </td>
                                                                        <td className="px-6 py-4 text-right">
                                                                            <span className="bg-stone-800 text-stone-300 px-2 py-1 rounded text-xs border border-stone-700">
                                                                                {mov.quantity} {mov.materials?.unit}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 text-right text-stone-400 text-sm">
                                                                            ₺{(mov.unit_price || 0).toFixed(2)}
                                                                        </td>
                                                                        <td className="px-6 py-4 text-right">
                                                                            <span className="text-red-400 font-bold bg-red-500/10 px-2 py-1 rounded border border-red-500/20">
                                                                                ₺{loss.toFixed(2)}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 text-stone-400 text-sm">{mov.note}</td>
                                                                    </tr>
                                                                )
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    )
}