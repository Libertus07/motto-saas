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
    document_url: '',
    document_file: null,
    document_organization_id: null,
  })

  // Rent Modal
  const [isRentModalOpen, setIsRentModalOpen] = useState(false)
  const [rentForm, setRentForm] = useState<RentFormState>({
    amount: '',
    account_id: '',
  })

  // Value Update Modal
  const [isValueModalOpen, setIsValueModalOpen] = useState(false)
  const [valueForm, setValueForm] = useState<ValueFormState>({
    current_value: '',
  })

  // Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    quantity: '',
    average_cost: '',
    notes: '',
    purchase_date: '',
    document_url: '',
    document_file: null,
    document_organization_id: null,
  })

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
      document_url: inv.document_url || '',
      document_file: null,
      document_organization_id: null,
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
      document_url: '',
      document_file: null,
      document_organization_id: null,
    })
    setRentForm({ amount: '', account_id: '' })
    setValueForm({ current_value: '' })
  }

  const closeBuyModal = () => {
    setIsBuyModalOpen(false)
    setBuyForm((current) => ({ ...current, document_file: null, document_organization_id: null }))
  }

  const closeEditModal = () => {
    setIsEditModalOpen(false)
    setEditForm((current) => ({ ...current, document_file: null, document_organization_id: null }))
  }

  return {
    groupBy,
    setGroupBy,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    expandedInvestment,
    setExpandedInvestment,
    selectedInvestment,
    setSelectedInvestment,

    isBuyModalOpen,
    setIsBuyModalOpen,
    buyForm,
    setBuyForm,

    isRentModalOpen,
    setIsRentModalOpen,
    rentForm,
    setRentForm,

    isValueModalOpen,
    setIsValueModalOpen,
    valueForm,
    setValueForm,

    isEditModalOpen,
    setIsEditModalOpen,
    editForm,
    setEditForm,

    isNoteModalOpen,
    setIsNoteModalOpen,
    notePreviewText,
    setNotePreviewText,

    openEditModal,
    resetForms,
    closeBuyModal,
    closeEditModal,
  }
}
