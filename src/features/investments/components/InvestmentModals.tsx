import dynamic from 'next/dynamic'
import type { ChangeEvent, FormEvent } from 'react'

import type { Account, BuyFormState, EditFormState, Investment, RentFormState, ValueFormState } from '../types'

const BuyInvestmentModal = dynamic(() => import('./BuyInvestmentModal').then((module) => module.BuyInvestmentModal), {
  ssr: false,
})
const RentIncomeModal = dynamic(() => import('./RentIncomeModal').then((module) => module.RentIncomeModal), {
  ssr: false,
})
const UpdateValueModal = dynamic(() => import('./UpdateValueModal').then((module) => module.UpdateValueModal), {
  ssr: false,
})
const EditInvestmentModal = dynamic(
  () => import('./EditInvestmentModal').then((module) => module.EditInvestmentModal),
  {
    ssr: false,
  },
)
const DocumentPreviewModal = dynamic(
  () => import('./DocumentPreviewModal').then((module) => module.DocumentPreviewModal),
  { ssr: false },
)
const NotePreviewModal = dynamic(() => import('./NotePreviewModal').then((module) => module.NotePreviewModal), {
  ssr: false,
})

type DocumentForm = { document_url?: string }

type InvestmentModalsProps = {
  accounts: Account[]
  saving: boolean
  selectedInvestment: Investment | null
  buy: {
    isOpen: boolean
    onClose: () => void
    form: BuyFormState
    setForm: (form: BuyFormState) => void
    onSubmit: (event: FormEvent) => void
    onAnalyzeReceipt: (event: ChangeEvent<HTMLInputElement>) => void
    isAnalyzing: boolean
  }
  rent: {
    isOpen: boolean
    onClose: () => void
    form: RentFormState
    setForm: (form: RentFormState) => void
    onSubmit: (event: FormEvent) => void
  }
  value: {
    isOpen: boolean
    onClose: () => void
    form: ValueFormState
    setForm: (form: ValueFormState) => void
    onSubmit: (event: FormEvent) => void
  }
  edit: {
    isOpen: boolean
    onClose: () => void
    form: EditFormState
    setForm: (form: EditFormState) => void
    onSubmit: (event: FormEvent) => void
  }
  documentPreview: { isOpen: boolean; onClose: () => void; url: string }
  notePreview: { isOpen: boolean; onClose: () => void; text: string }
  onFileUpload: <T extends DocumentForm>(
    event: ChangeEvent<HTMLInputElement>,
    setter: (form: T) => void,
    state: T,
  ) => void
}

export function InvestmentModals({
  accounts,
  saving,
  selectedInvestment,
  buy,
  rent,
  value,
  edit,
  documentPreview,
  notePreview,
  onFileUpload,
}: InvestmentModalsProps) {
  return (
    <>
      <BuyInvestmentModal
        isOpen={buy.isOpen}
        onClose={buy.onClose}
        form={buy.form}
        setForm={buy.setForm}
        accounts={accounts}
        onSubmit={buy.onSubmit}
        saving={saving}
        onFileUpload={onFileUpload}
        onAnalyzeReceipt={buy.onAnalyzeReceipt}
        isAnalyzing={buy.isAnalyzing}
      />
      <RentIncomeModal
        isOpen={rent.isOpen}
        onClose={rent.onClose}
        investmentName={selectedInvestment?.name || ''}
        form={rent.form}
        setForm={rent.setForm}
        accounts={accounts}
        onSubmit={rent.onSubmit}
        saving={saving}
      />
      <UpdateValueModal
        isOpen={value.isOpen}
        onClose={value.onClose}
        investmentName={selectedInvestment?.name || ''}
        form={value.form}
        setForm={value.setForm}
        onSubmit={value.onSubmit}
        saving={saving}
      />
      <EditInvestmentModal
        isOpen={edit.isOpen}
        onClose={edit.onClose}
        investment={selectedInvestment}
        form={edit.form}
        setForm={edit.setForm}
        onSubmit={edit.onSubmit}
        saving={saving}
        onFileUpload={onFileUpload}
      />
      <DocumentPreviewModal {...documentPreview} />
      <NotePreviewModal {...notePreview} />
    </>
  )
}
