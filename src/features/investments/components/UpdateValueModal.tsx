import { ValueFormState } from '../types'
import { FormEvent } from 'react'

type UpdateValueModalProps = {
    isOpen: boolean
    onClose: () => void
    investmentName: string
    form: ValueFormState
    setForm: (form: ValueFormState) => void
    onSubmit: (e: FormEvent) => void
    saving: boolean
}

export function UpdateValueModal({
    isOpen,
    onClose,
    investmentName,
    form,
    setForm,
    onSubmit,
    saving
}: UpdateValueModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">📈 Güncel Değeri Belirle</h3>
                    <button onClick={onClose} className="text-stone-500 hover:text-white text-xl">✕</button>
                </div>
                <p className="text-stone-400 text-sm mb-4">
                    {investmentName} mülkünün güncel emlak piyasası/ekspertiz değerini güncelleyin. Kâr/Zarar hesabınız buna göre şekillenecektir.
                </p>
                
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label className="text-stone-400 text-sm mb-1 block">Yeni Ekspertiz / Piyasa Değeri (₺)</label>
                        <input 
                            type="number"
                            required
                            step="1"
                            min="1"
                            value={form.current_value}
                            onChange={(e) => setForm({...form, current_value: e.target.value})}
                            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 text-xl font-bold"
                            placeholder="Örn: 4500000"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={saving || !form.current_value}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-4 rounded-xl transition-colors disabled:opacity-50 mt-4 text-lg"
                    >
                        {saving ? 'İşleniyor...' : 'Değeri Güncelle'}
                    </button>
                </form>
            </div>
        </div>
    )
}
