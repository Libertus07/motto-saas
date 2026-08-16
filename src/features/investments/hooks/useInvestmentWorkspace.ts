import type { FormEvent } from 'react'
import { useCallback, useEffect, useMemo } from 'react'

import { useNotification } from '@/components/NotificationProvider'
import { useDocumentPreview } from '@/features/documents'
import { useAppTour } from '@/hooks/useAppTour'

import type { EnhancedInvestment } from '../types'
import { investmentTourSteps } from '../tour'
import { buildInvestmentPortfolio } from '../utils'
import { useInvestmentDocuments } from './useInvestmentDocuments'
import { useInvestmentsData } from './useInvestmentsData'
import { useInvestmentsUI } from './useInvestmentsUI'

export function useInvestmentWorkspace() {
  const { showAlert } = useNotification()
  const data = useInvestmentsData()
  const ui = useInvestmentsUI()
  const documentPreview = useDocumentPreview(data.activeOrganizationId ?? null)
  const { buyForm, setBuyForm } = ui
  const documents = useInvestmentDocuments({
    setBuyForm,
    showAlert,
    organizationId: data.activeOrganizationId,
    getCurrentOrganizationId: data.getCurrentOrganizationId,
    getCurrentOrganizationVersion: data.getCurrentOrganizationVersion,
  })

  const closeBuyModal = useCallback(() => {
    documents.cancelAnalysis()
    ui.closeBuyModal()
  }, [documents, ui])

  useAppTour('yatirimlar', investmentTourSteps, 800)

  useEffect(() => {
    if (!data.rates || !buyForm.asset_type || buyForm.asset_type === 'real_estate') return
    const assetType = buyForm.asset_type as 'gold' | 'usd' | 'eur'
    setBuyForm((current) => ({ ...current, price_per_unit: data.rates?.[assetType].toString() || '' }))
  }, [buyForm.asset_type, data.rates, setBuyForm])

  const portfolio = useMemo(
    () =>
      buildInvestmentPortfolio({
        investments: data.investments,
        transactions: data.transactions,
        rates: data.rates,
        groupBy: ui.groupBy,
        sortBy: ui.sortBy,
        sortOrder: ui.sortOrder,
      }),
    [data.investments, data.rates, data.transactions, ui.groupBy, ui.sortBy, ui.sortOrder],
  )

  const submitBuy = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!(await data.buyInvestment(ui.buyForm))) return

      closeBuyModal()
      ui.resetForms()
      if (data.rates && ui.buyForm.asset_type !== 'real_estate') {
        const assetType = ui.buyForm.asset_type as 'gold' | 'usd' | 'eur'
        ui.setBuyForm((current) => ({ ...current, price_per_unit: data.rates?.[assetType].toString() || '' }))
      }
    },
    [closeBuyModal, data, ui],
  )

  const submitRent = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!ui.selectedInvestment || !(await data.collectRent(ui.selectedInvestment.id, ui.rentForm))) return
      ui.setIsRentModalOpen(false)
      ui.resetForms()
    },
    [data, ui],
  )

  const submitValueUpdate = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!ui.selectedInvestment || !(await data.updateValue(ui.selectedInvestment.id, ui.valueForm))) return
      ui.setIsValueModalOpen(false)
      ui.resetForms()
    },
    [data, ui],
  )

  const submitEdit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!ui.selectedInvestment || !(await data.editInvestment(ui.selectedInvestment.id, ui.editForm))) return
      ui.closeEditModal()
    },
    [data, ui],
  )

  const openRent = useCallback(
    (investment: EnhancedInvestment) => {
      ui.setSelectedInvestment(investment)
      ui.setIsRentModalOpen(true)
    },
    [ui],
  )

  const openValueUpdate = useCallback(
    (investment: EnhancedInvestment) => {
      ui.setSelectedInvestment(investment)
      ui.setValueForm({ current_value: investment.current_manual_value?.toString() || '' })
      ui.setIsValueModalOpen(true)
    },
    [ui],
  )

  return {
    header: { onCreate: () => ui.setIsBuyModalOpen(true) },
    metrics: {
      totalCostValue: portfolio.totalCostValue,
      totalCurrentValue: portfolio.totalCurrentValue,
      totalRentIncome: portfolio.totalRentIncome,
      totalProfit: portfolio.totalProfit,
      profitPercentage: portfolio.profitPercentage,
    },
    toolbar: {
      groupBy: ui.groupBy,
      sortBy: ui.sortBy,
      sortOrder: ui.sortOrder,
      onGroupByChange: ui.setGroupBy,
      onSortByChange: ui.setSortBy,
      onToggleSortOrder: () => ui.setSortOrder((current) => (current === 'desc' ? 'asc' : 'desc')),
    },
    list: {
      loading: data.loading,
      groupedInvestments: portfolio.groups,
      groupBy: ui.groupBy,
      transactions: data.transactions,
      expandedInvestment: ui.expandedInvestment,
      setExpandedInvestment: ui.setExpandedInvestment,
      onRent: openRent,
      onUpdateValue: openValueUpdate,
      onNote: (note: string) => {
        ui.setNotePreviewText(note)
        ui.setIsNoteModalOpen(true)
      },
      onDoc: documentPreview.openDocument,
      documentPreviewLoadingReference: documentPreview.previewReference,
      onEdit: ui.openEditModal,
      onDelete: data.deleteInvestment,
    },
    modals: {
      accounts: data.accounts,
      saving: data.saving,
      selectedInvestment: ui.selectedInvestment,
      buy: {
        isOpen: ui.isBuyModalOpen,
        onClose: closeBuyModal,
        form: ui.buyForm,
        setForm: ui.setBuyForm,
        onSubmit: submitBuy,
        onAnalyzeReceipt: documents.analyzeReceipt,
        isAnalyzing: documents.isAnalyzing,
      },
      rent: {
        isOpen: ui.isRentModalOpen,
        onClose: () => ui.setIsRentModalOpen(false),
        form: ui.rentForm,
        setForm: ui.setRentForm,
        onSubmit: submitRent,
      },
      value: {
        isOpen: ui.isValueModalOpen,
        onClose: () => ui.setIsValueModalOpen(false),
        form: ui.valueForm,
        setForm: ui.setValueForm,
        onSubmit: submitValueUpdate,
      },
      edit: {
        isOpen: ui.isEditModalOpen,
        onClose: ui.closeEditModal,
        form: ui.editForm,
        setForm: ui.setEditForm,
        onSubmit: submitEdit,
      },
      documentPreview: {
        isOpen: !!documentPreview.previewUrl,
        onClose: documentPreview.closeDocument,
        url: documentPreview.previewUrl ?? '',
      },
      notePreview: {
        isOpen: ui.isNoteModalOpen,
        onClose: () => ui.setIsNoteModalOpen(false),
        text: ui.notePreviewText,
      },
      onFileUpload: documents.uploadDocument,
    },
  }
}
