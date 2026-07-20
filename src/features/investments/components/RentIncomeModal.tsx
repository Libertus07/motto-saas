import { formatCurrency } from "@/lib/format"
import { Account, RentFormState } from '../types'
import { FormEvent } from 'react'

type RentIncomeModalProps = {
    isOpen: boolean
    onClose: () => void
    investmentName: string
    form: RentFormState
    setForm: (form: RentFormState) => void
    accounts: Account[]
    onSubmit: (e: FormEvent) => void
    saving: boolean
}

export function RentIncomeModal({
    isOpen,
    onClose,
    investmentName,
    form,
    setForm,
    accounts,
    onSubmit,
    saving
}: RentIncomeModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">💰 Kira Tahsil Et</h3>
                    <button onClick={onClose} className="text-stone-500 hover:text-white text-xl">✕</button>
                </div>
                <p className="text-stone-400 text-sm mb-4">
                    {investmentName} için aldığınız kira ödemesini girin. Bu tutar işletmenizin nakit akışına (hesap bakiyesine) dahil edilecektir.
                </p>
                
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label className="text-stone-400 text-sm mb-1 block text-green-500/80">Kira Tutarı (₺)</label>
                        <input 
                            type="number"
                            required
                            step="1"
                            min="1"
                            value={form.amount}
                            onChange={(e) => setForm({...form, amount: e.target.value})}
                            className="w-full bg-green-500/5 border border-green-500/30 rounded-xl px-4 py-3 text-green-400 focus:outline-none focus:border-green-400 text-xl font-bold"
                            placeholder="Örn: 15000"
                        />
                    </div>
                    
                    <div>
                        <label className="text-stone-400 text-sm mb-1 block">Kiranın Yattığı Hesap (Giriş)</label>
                        <select 
                            required
                            value={form.account_id}
                            onChange={(e) => setForm({...form, account_id: e.target.value})}
                            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green-400 font-medium"
                        >
                            <option value="" disabled>Hesap Seçin...</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} (Bakiye:{formatCurrency(acc.balance)})</option>
                            ))}
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={saving || !form.amount || !form.account_id}
                        className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-50 mt-4 text-lg"
                    >
                        {saving ? 'İşleniyor...' : 'Kirayı Hesaba Ekle'}
                    </button>
                </form>
            </div>
        </div>
    )
}
