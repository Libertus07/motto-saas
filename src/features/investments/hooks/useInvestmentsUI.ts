import { useState } from 'react'
import { Investment } from '@/types/database'
import { BuyFormState, EditFormState, RentFormState, ValueFormState } from '../types'

export function useInvestmentsUI() {
    // Grouping & Sorting States
    const [groupBy, setGroupBy] = useState<'type' | 'month'>('type')
    const [sortBy, setSortBy] = useState<'date' | 'value'>('date')
    const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
    
    // List States
    const [expandedInvestment, setExpandedInvestment] = useState<string | null>(null)
    const [selectedInvestment, setSelectedInvestment] = useState<Investment | null>(null)

    // Buy Modal
    const [isBuyModalOpen, setIsBuyModalOpen] = useState(false)
    const [buyForm, setBuyForm] = useState<BuyFormState>({
        asset_type: 'gold',
        quantity: '',
        price_per_unit: '', 
        account_id: '',
        notes: '',
        purchase_date: new Date().toISOString().split('T')[0],
        document_url: ''
    })
    
    // Rent Modal
    const [isRentModalOpen, setIsRentModalOpen] = useState(false)
    const [rentForm, setRentForm] = useState<RentFormState>({
        amount: '',
        account_id: ''
    })

    // Value Update Modal
    const [isValueModalOpen, setIsValueModalOpen] = useState(false)
    const [valueForm, setValueForm] = useState<ValueFormState>({
        current_value: ''
    })

    // Edit Modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)
    const [editForm, setEditForm] = useState<EditFormState>({
        name: '',
        quantity: '',
        average_cost: '',
        notes: '',
        purchase_date: '',
        document_url: ''
    })

    // Doc Preview
    const [isDocModalOpen, setIsDocModalOpen] = useState(false)
    const [docPreviewUrl, setDocPreviewUrl] = useState('')

    // Note Preview
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)
    const [notePreviewText, setNotePreviewText] = useState('')

    const openEditModal = (inv: Investment) => {
        setSelectedInvestment(inv)
        setEditForm({
            name: inv.name,
            quantity: inv.quantity.toString(),
            average_cost: inv.average_cost.toString(),
            notes: inv.notes || '',
            purchase_date: inv.purchase_date || new Date().toISOString().split('T')[0],
            document_url: inv.document_url || ''
        })
        setIsEditModalOpen(true)
    }

    const resetForms = () => {
        setBuyForm({
            asset_type: 'gold',
            quantity: '',
            price_per_unit: '', 
            account_id: '',
            notes: '',
            purchase_date: new Date().toISOString().split('T')[0],
            document_url: ''
        })
        setRentForm({ amount: '', account_id: '' })
        setValueForm({ current_value: '' })
    }

    return {
        groupBy, setGroupBy,
        sortBy, setSortBy,
        sortOrder, setSortOrder,
        expandedInvestment, setExpandedInvestment,
        selectedInvestment, setSelectedInvestment,
        
        isBuyModalOpen, setIsBuyModalOpen,
        buyForm, setBuyForm,

        isRentModalOpen, setIsRentModalOpen,
        rentForm, setRentForm,

        isValueModalOpen, setIsValueModalOpen,
        valueForm, setValueForm,

        isEditModalOpen, setIsEditModalOpen,
        editForm, setEditForm,

        isDocModalOpen, setIsDocModalOpen,
        docPreviewUrl, setDocPreviewUrl,

        isNoteModalOpen, setIsNoteModalOpen,
        notePreviewText, setNotePreviewText,

        openEditModal,
        resetForms
    }
}
