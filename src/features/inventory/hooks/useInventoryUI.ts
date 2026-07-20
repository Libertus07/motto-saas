import { useState } from 'react'
import { 
    MovementFormState, 
    InlineFormState, 
    InventoryTab,
    MovementDateFilter,
    MovementTypeFilter,
    ZayiDateFilter,
    ZayiSortBy
} from '../types'

export function useInventoryUI() {
    const [activeTab, setActiveTab] = useState<InventoryTab>('stok')
    const [showForm, setShowForm] = useState(false)
    
    // Main Form
    const [form, setForm] = useState<MovementFormState>({
        material_id: '',
        movement_type: 'giris',
        quantity: '',
        unit_price: '',
        note: ''
    })

    const resetForm = () => setForm({
        material_id: '',
        movement_type: 'giris',
        quantity: '',
        unit_price: '',
        note: ''
    })
    
    // Inline Form
    const [inlineMovementMatId, setInlineMovementMatId] = useState<string | null>(null)
    const [inlineMovementType, setInlineMovementType] = useState<'giris' | 'cikis'>('giris')
    const [inlineForm, setInlineForm] = useState<InlineFormState>({ quantity: '', unit_price: '', note: '' })

    const resetInlineForm = () => {
        setInlineMovementMatId(null)
        setInlineForm({ quantity: '', unit_price: '', note: '' })
    }

    // Sayim
    const [sayimData, setSayimData] = useState<{ [key: string]: string }>({})
    const [sayimSearchTerm, setSayimSearchTerm] = useState('')

    const resetSayim = () => {
        setSayimData({})
    }

    // Movement Filters
    const [movementSearchTerm, setMovementSearchTerm] = useState('')
    const [movementTypeFilter, setMovementTypeFilter] = useState<MovementTypeFilter>('tumu')
    const [movementDateFilter, setMovementDateFilter] = useState<MovementDateFilter>('bu_ay')
    const [movementStartDate, setMovementStartDate] = useState('')
    const [movementEndDate, setMovementEndDate] = useState('')
    const [movementPage, setMovementPage] = useState(1)
    const [movementCollapsedDates, setMovementCollapsedDates] = useState<Set<string>>(new Set())

    const clearMovementFilters = () => {
        setMovementSearchTerm('')
        setMovementTypeFilter('tumu')
        setMovementDateFilter('bu_ay')
        setMovementStartDate('')
        setMovementEndDate('')
        setMovementPage(1)
    }

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

    // Zayi Filters
    const [zayiDateFilter, setZayiDateFilter] = useState<ZayiDateFilter>('bu_ay')
    const [zayiSortBy, setZayiSortBy] = useState<ZayiSortBy>('tarih_yeni')
    const [zayiSearchTerm, setZayiSearchTerm] = useState('')
    const [zayiExpandedDates, setZayiExpandedDates] = useState<string[]>(['Bugün'])

    const toggleZayiDate = (dateKey: string) => {
        setZayiExpandedDates(prev => prev.includes(dateKey) ? prev.filter(d => d !== dateKey) : [...prev, dateKey])
    }

    return {
        // Tabs
        activeTab, setActiveTab,
        // Main Form
        showForm, setShowForm,
        form, setForm, resetForm,
        // Inline Form
        inlineMovementMatId, setInlineMovementMatId,
        inlineMovementType, setInlineMovementType,
        inlineForm, setInlineForm, resetInlineForm,
        // Sayim
        sayimData, setSayimData, resetSayim,
        sayimSearchTerm, setSayimSearchTerm,
        // Movement Filters
        movementSearchTerm, setMovementSearchTerm,
        movementTypeFilter, setMovementTypeFilter,
        movementDateFilter, setMovementDateFilter,
        movementStartDate, setMovementStartDate,
        movementEndDate, setMovementEndDate,
        movementPage, setMovementPage,
        movementCollapsedDates, setMovementCollapsedDates,
        clearMovementFilters, toggleMovementDate,
        // Zayi Filters
        zayiDateFilter, setZayiDateFilter,
        zayiSortBy, setZayiSortBy,
        zayiSearchTerm, setZayiSearchTerm,
        zayiExpandedDates, setZayiExpandedDates,
        toggleZayiDate
    }
}
