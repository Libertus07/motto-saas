import { Investment } from '@/types/database'
import { EditFormState } from '../types'
import { ChangeEvent, FormEvent } from 'react'

type EditInvestmentModalProps = {
    isOpen: boolean
    onClose: () => void
    investment: Investment | null
    form: EditFormState
    setForm: (form: EditFormState) => void
    onSubmit: (e: FormEvent) => void
    saving: boolean
    onFileUpload: (e: ChangeEvent<HTMLInputElement>, setter: any, state: any) => void
}

export function EditInvestmentModal({
    isOpen,
    onClose,
    investment,
    form,
    setForm,
    onSubmit,
    saving,
    onFileUpload
}: EditInvestmentModalProps) {
    if (!isOpen || !investment) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><span>✏️</span> Yatırımı Düzenle</h3>
                    <button onClick={onClose} className="text-stone-500 hover:text-white text-xl">✕</button>
                </div>
                
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label className="text-stone-400 text-sm mb-1 block">Yatırım Adı</label>
                        <input 
                            type="text"
                            required
                            value={form.name}
                            onChange={(e) => setForm({...form, name: e.target.value})}
                            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {investment.asset_type !== 'real_estate' && (
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Miktar</label>
                                <input 
                                    type="number"
                                    required
                                    step="0.0001"
                                    min="0"
                                    value={form.quantity}
                                    onChange={(e) => setForm({...form, quantity: e.target.value})}
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                                />
                            </div>
                        )}
                        
                        <div className={investment.asset_type === 'real_estate' ? 'col-span-2' : ''}>
                            <label className="text-stone-400 text-sm mb-1 block">{investment.asset_type === 'real_estate' ? 'Toplam Alış Maliyeti' : 'Ortalama Maliyet (₺)'}</label>
                            <input 
                                type="number"
                                required
                                step="0.0001"
                                min="0"
                                value={form.average_cost}
                                onChange={(e) => setForm({...form, average_cost: e.target.value})}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-amber-400 focus:outline-none focus:border-amber-400"
                            />
                        </div>
                    </div>

                    <div className="pt-4 border-t border-stone-800 space-y-4">
                        <div>
                            <label className="text-stone-400 text-sm mb-1 block">Alım Tarihi</label>
                            <input 
                                type="date"
                                value={form.purchase_date}
                                onChange={(e) => setForm({...form, purchase_date: e.target.value})}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                            />
                        </div>

                        <div>
                            <label className="text-stone-400 text-sm mb-1 block">Belge Güncelle</label>
                            <input 
                                type="file"
                                accept="image/*,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                                onChange={(e) => onFileUpload(e, setForm, form)}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-400 focus:outline-none focus:border-amber-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-500 file:text-stone-950 hover:file:bg-amber-400"
                            />
                            {form.document_url && !form.document_url.startsWith('data:') && (
                                <p className="text-xs text-amber-500 mt-2">Mevcut bir belge yüklü.</p>
                            )}
                        </div>

                        <div>
                            <label className="text-stone-400 text-sm mb-1 block">Açıklama / Notlar</label>
                            <textarea 
                                rows={3}
                                value={form.notes}
                                onChange={(e) => setForm({...form, notes: e.target.value})}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 resize-none"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-4 rounded-xl transition-colors disabled:opacity-50 mt-4"
                    >
                        {saving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                    </button>
                </form>
            </div>
        </div>
    )
}
