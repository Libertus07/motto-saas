'use client'

import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useNotification } from '@/components/NotificationProvider'
import { formatCurrency, formatDate } from "@/lib/format"
import { devError } from '@/lib/debug'
import { EnhancedInvestment } from '@/features/investments/types'

// Hooks
import { useInvestmentsData } from '@/features/investments/hooks/useInvestmentsData'
import { useInvestmentsUI } from '@/features/investments/hooks/useInvestmentsUI'

// Components
import { InvestmentsList } from '@/features/investments/components/InvestmentsList'
import { BuyInvestmentModal } from '@/features/investments/components/BuyInvestmentModal'
import { RentIncomeModal } from '@/features/investments/components/RentIncomeModal'
import { UpdateValueModal } from '@/features/investments/components/UpdateValueModal'
import { EditInvestmentModal } from '@/features/investments/components/EditInvestmentModal'
import { DocumentPreviewModal } from '@/features/investments/components/DocumentPreviewModal'
import { NotePreviewModal } from '@/features/investments/components/NotePreviewModal'

export default function YatirimlarPage() {
    const { showAlert } = useNotification()
    const {
        accounts, investments, transactions, rates,
        loading, saving, fetchData, deleteInvestment,
        buyInvestment, editInvestment, collectRent, updateValue
    } = useInvestmentsData()

    const ui = useInvestmentsUI()

    const [isAnalyzing, setIsAnalyzing] = useState(false)

    const handleAnalyzeReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setIsAnalyzing(true)
        try {
            const formData = new FormData()
            formData.append('file', file)

            const response = await fetch('/api/ai/analyze-receipt', {
                method: 'POST',
                body: formData
            })

            const result = await response.json()

            if (!result.success) throw new Error(result.error)

            const data = result.data
            ui.setBuyForm(prev => ({
                ...prev,
                asset_type: data.type === 'USD' ? 'usd' : data.type === 'EUR' ? 'eur' : data.type === 'GOLD' ? 'gold' : 'gold',
                quantity: data.amount?.toString() || prev.quantity,
                price_per_unit: data.rate?.toString() || prev.price_per_unit,
                notes: `AI: ${data.notes || ''}`
            }))

            await showAlert('Fiş başarıyla okundu ve form dolduruldu.', 'success')

        } catch (error: any) {
            devError('Fiş okuma hatası', error)
            await showAlert('Yapay zeka fişi okurken bir hata oluştu: ' + error.message, 'error')
        } finally {
            setIsAnalyzing(false)
            if (e.target) e.target.value = ''
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, formSetter: any, formState: any) => {
        const file = e.target.files?.[0]
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                await showAlert('Dosya boyutu çok büyük! Maksimum 2MB yükleyebilirsiniz.', 'warning')
                return
            }
            const reader = new FileReader()
            reader.onloadend = () => {
                formSetter({ ...formState, document_url: reader.result as string })
            }
            reader.readAsDataURL(file)
        }
    }

    // --- DATA PROCESSING & GROUPING ---
    let totalCurrentValue = 0
    let totalCostValue = 0
    let totalRentIncome = 0

    const enhancedInvestments = investments.map(inv => {
        const isRE = inv.asset_type === 'real_estate'
        const currentRate = isRE ? 0 : (rates ? rates[inv.asset_type as keyof typeof rates] : Number(inv.average_cost))
        
        const currentValue = isRE ? Number(inv.current_manual_value || 0) : (Number(inv.quantity) * currentRate)
        const costValue = Number(inv.quantity) * Number(inv.average_cost)
        
        const invRentIncome = transactions.filter(t => t.investment_id === inv.id && t.transaction_type === 'rent').reduce((t, tx) => t + Number(tx.total_amount), 0)
        
        const profit = (currentValue - costValue) + invRentIncome

        totalCostValue += costValue
        totalCurrentValue += currentValue
        
        return {
            ...inv,
            isRE,
            currentRate,
            currentValue,
            costValue,
            invRentIncome,
            profit,
            isProfit: profit >= 0
        } as EnhancedInvestment
    })

    transactions.forEach(tx => {
        if (tx.transaction_type === 'rent') {
            totalRentIncome += Number(tx.total_amount)
        }
    })

    const totalProfit = (totalCurrentValue - totalCostValue) + totalRentIncome
    const profitPercentage = totalCostValue > 0 ? (totalProfit / totalCostValue) * 100 : 0

    // Sorting
    enhancedInvestments.sort((a, b) => {
        if (ui.sortBy === 'value') {
            return ui.sortOrder === 'desc' ? b.currentValue - a.currentValue : a.currentValue - b.currentValue
        } else {
            const dateA = new Date(a.purchase_date || a.created_at || 0).getTime()
            const dateB = new Date(b.purchase_date || b.created_at || 0).getTime()
            return ui.sortOrder === 'desc' ? dateB - dateA : dateA - dateB
        }
    })

    // Grouping
    const groupedInvestments: Record<string, EnhancedInvestment[]> = {}
    enhancedInvestments.forEach(inv => {
        let groupKey = 'Diğer'
        if (ui.groupBy === 'type') {
            if (inv.asset_type === 'gold') groupKey = 'Altın Yatırımları'
            else if (inv.asset_type === 'usd') groupKey = 'Dolar (USD)'
            else if (inv.asset_type === 'eur') groupKey = 'Euro (EUR)'
            else if (inv.asset_type === 'real_estate') groupKey = 'Gayrimenkul Mülkleri'
        } else {
            if (inv.purchase_date) {
                const d = new Date(inv.purchase_date)
                groupKey = formatDate(d)
            } else {
                groupKey = 'Tarih Belirtilmeyenler'
            }
        }

        if (!groupedInvestments[groupKey]) groupedInvestments[groupKey] = []
        groupedInvestments[groupKey].push(inv)
    })

    // Form Submits
    const handleBuySubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const success = await buyInvestment(ui.buyForm)
        if (success) {
            ui.setIsBuyModalOpen(false)
            ui.resetForms()
            if (rates && ui.buyForm.asset_type !== 'real_estate') {
                const assetType = ui.buyForm.asset_type as 'gold' | 'usd' | 'eur'
                ui.setBuyForm(prev => ({ ...prev, price_per_unit: rates[assetType].toString() }))
            }
        }
    }

    const handleRentSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!ui.selectedInvestment) return
        const success = await collectRent(ui.selectedInvestment.id, ui.selectedInvestment.name, ui.rentForm)
        if (success) {
            ui.setIsRentModalOpen(false)
            ui.resetForms()
        }
    }

    const handleValueUpdateSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!ui.selectedInvestment) return
        const success = await updateValue(ui.selectedInvestment.id, ui.selectedInvestment.name, ui.valueForm, Number(ui.selectedInvestment.current_manual_value || 0))
        if (success) {
            ui.setIsValueModalOpen(false)
            ui.resetForms()
        }
    }

    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!ui.selectedInvestment) return
        const success = await editInvestment(ui.selectedInvestment.id, ui.editForm, ui.selectedInvestment)
        if (success) {
            ui.setIsEditModalOpen(false)
        }
    }

    useEffect(() => {
        if (rates && ui.buyForm.asset_type && ui.buyForm.asset_type !== 'real_estate') {
            const assetType = ui.buyForm.asset_type as 'gold' | 'usd' | 'eur';
            ui.setBuyForm(prev => ({ ...prev, price_per_unit: rates[assetType].toString() }))
        }
    }, [ui.buyForm.asset_type, rates])


    // Handlers for List Actions
    const handleRent = (inv: EnhancedInvestment) => {
        ui.setSelectedInvestment(inv)
        ui.setIsRentModalOpen(true)
    }

    const handleUpdateValue = (inv: EnhancedInvestment) => {
        ui.setSelectedInvestment(inv)
        ui.setValueForm({ current_value: inv.current_manual_value?.toString() || '' })
        ui.setIsValueModalOpen(true)
    }

    const handleNote = (note: string) => {
        ui.setNotePreviewText(note)
        ui.setIsNoteModalOpen(true)
    }

    const handleDoc = (url: string) => {
        ui.setDocPreviewUrl(url)
        ui.setIsDocModalOpen(true)
    }

    const handleEdit = (inv: EnhancedInvestment) => {
        ui.openEditModal(inv)
    }

    return (
        <div className="min-h-full bg-stone-950 text-white pb-20">
            <header className="mb-8 p-6 pb-0 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-amber-500 flex items-center gap-3">
                        📈 Yatırımlar ve Portföy
                    </h1>
                    <p className="text-stone-400 mt-2 max-w-2xl">
                        İşletmenizin varlıklarını döviz, altın ve gayrimenkul olarak koruyun; anlık değerlerini ve kira getirilerini takip edin.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <button 
                        onClick={() => ui.setIsBuyModalOpen(true)}
                        className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-3 rounded-xl transition-colors shadow-[0_0_20px_rgba(245,158,11,0.2)] whitespace-nowrap"
                    >
                        + Yeni Yatırım Yap
                    </button>
                </div>
            </header>

            <main className="p-6 pt-0 space-y-6">
                
                {/* Genel Özet Paneli */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 relative overflow-hidden">
                        <div className="absolute -right-4 -top-4 text-7xl opacity-5">💰</div>
                        <p className="text-stone-400 text-sm mb-1 font-bold">Toplam Yatırım Maliyeti</p>
                        <h2 className="text-3xl font-bold text-white mb-2">{formatCurrency(totalCostValue)}</h2>
                        <p className="text-xs text-stone-500">Ödediğiniz toplam anapara</p>
                    </div>
                    
                    <div className="bg-stone-900 border border-amber-500/30 rounded-2xl p-6 relative overflow-hidden shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                        <div className="absolute -right-4 -top-4 text-7xl opacity-5">💎</div>
                        <p className="text-amber-500/80 text-sm mb-1 font-bold">Güncel Varlık Değeri</p>
                        <h2 className="text-3xl font-bold text-amber-500 mb-2">{formatCurrency(totalCurrentValue)}</h2>
                        <p className="text-xs text-amber-500/50">Canlı kurlar ve ekspertiz değerleri</p>
                    </div>

                    <div className={`border rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between ${totalProfit >= 0 ? 'bg-green-950/20 border-green-500/30' : 'bg-red-950/20 border-red-500/30'}`}>
                        <div className="absolute -right-4 -top-4 text-7xl opacity-5">📈</div>
                        <div>
                            <p className={`text-sm mb-1 font-bold ${totalProfit >= 0 ? 'text-green-500/80' : 'text-red-500/80'}`}>
                                Toplam Kâr / Zarar
                            </p>
                            <h2 className={`text-3xl font-bold mb-2 flex flex-wrap items-center gap-2 ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {totalProfit >= 0 ? '+' : ''}{formatCurrency(totalProfit)}
                                <span className="text-lg bg-black/20 px-2 py-1 rounded-lg">
                                    {totalProfit >= 0 ? '+' : ''}{profitPercentage.toFixed(2)}%
                                </span>
                            </h2>
                        </div>
                        {totalRentIncome > 0 && (
                            <p className={`text-xs mt-2 ${totalProfit >= 0 ? 'text-green-500/70' : 'text-red-500/70'}`}>
                                (Bu kâra {formatCurrency(totalRentIncome)} toplam kira geliri dahildir)
                            </p>
                        )}
                    </div>
                </div>

                {/* Varlıklar Listesi & Toolbar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-8 mb-4 gap-4">
                    <h3 className="text-xl font-bold">Varlık Portföyünüz</h3>
                    
                    <div className="flex flex-wrap items-center gap-2 bg-stone-900 border border-stone-800 p-2 rounded-xl">
                        <select 
                            value={ui.groupBy} 
                            onChange={e => ui.setGroupBy(e.target.value as 'type'|'month')}
                            className="bg-stone-950 text-sm text-stone-300 font-medium border border-stone-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500"
                        >
                            <option value="type">Türüne Göre Grupla</option>
                            <option value="month">Ay/Yıla Göre Grupla</option>
                        </select>
                        
                        <select 
                            value={ui.sortBy} 
                            onChange={e => ui.setSortBy(e.target.value as 'date'|'value')}
                            className="bg-stone-950 text-sm text-stone-300 font-medium border border-stone-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500"
                        >
                            <option value="date">Tarihe Göre Sırala</option>
                            <option value="value">Değere Göre Sırala</option>
                        </select>
                        
                        <button 
                            onClick={() => ui.setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
                            className="bg-stone-950 hover:bg-stone-800 text-stone-400 px-3 py-1.5 text-sm font-bold rounded-lg border border-stone-800 transition-colors flex items-center gap-1"
                            title={ui.sortOrder === 'desc' ? 'Azalan Sıralama (Z-A, Yeni-Eski, Yüksek-Düşük)' : 'Artan Sıralama (A-Z, Eski-Yeni, Düşük-Yüksek)'}
                        >
                            {ui.sortOrder === 'desc' ? '⬇️ Azalan' : '⬆️ Artan'}
                        </button>
                    </div>
                </div>

                <InvestmentsList 
                    loading={loading}
                    groupedInvestments={groupedInvestments}
                    groupBy={ui.groupBy}
                    transactions={transactions}
                    expandedInvestment={ui.expandedInvestment}
                    setExpandedInvestment={ui.setExpandedInvestment}
                    onRent={handleRent}
                    onUpdateValue={handleUpdateValue}
                    onNote={handleNote}
                    onDoc={handleDoc}
                    onEdit={handleEdit}
                    onDelete={deleteInvestment}
                />
            </main>

            <BuyInvestmentModal 
                isOpen={ui.isBuyModalOpen}
                onClose={() => ui.setIsBuyModalOpen(false)}
                form={ui.buyForm}
                setForm={ui.setBuyForm}
                accounts={accounts}
                onSubmit={handleBuySubmit}
                saving={saving}
                onFileUpload={handleFileUpload}
                onAnalyzeReceipt={handleAnalyzeReceipt}
                isAnalyzing={isAnalyzing}
            />

            <RentIncomeModal 
                isOpen={ui.isRentModalOpen}
                onClose={() => ui.setIsRentModalOpen(false)}
                investmentName={ui.selectedInvestment?.name || ''}
                form={ui.rentForm}
                setForm={ui.setRentForm}
                accounts={accounts}
                onSubmit={handleRentSubmit}
                saving={saving}
            />

            <UpdateValueModal 
                isOpen={ui.isValueModalOpen}
                onClose={() => ui.setIsValueModalOpen(false)}
                investmentName={ui.selectedInvestment?.name || ''}
                form={ui.valueForm}
                setForm={ui.setValueForm}
                onSubmit={handleValueUpdateSubmit}
                saving={saving}
            />

            <EditInvestmentModal 
                isOpen={ui.isEditModalOpen}
                onClose={() => ui.setIsEditModalOpen(false)}
                investment={ui.selectedInvestment}
                form={ui.editForm}
                setForm={ui.setEditForm}
                onSubmit={handleEditSubmit}
                saving={saving}
                onFileUpload={handleFileUpload}
            />

            <DocumentPreviewModal 
                isOpen={ui.isDocModalOpen}
                onClose={() => ui.setIsDocModalOpen(false)}
                url={ui.docPreviewUrl}
            />

            <NotePreviewModal 
                isOpen={ui.isNoteModalOpen}
                onClose={() => ui.setIsNoteModalOpen(false)}
                text={ui.notePreviewText}
            />
        </div>
    )
}
