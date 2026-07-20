import { formatCurrency } from "@/lib/format"
import { Account, BuyFormState } from '../types'
import { ChangeEvent, FormEvent } from 'react'

type BuyInvestmentModalProps = {
    isOpen: boolean
    onClose: () => void
    form: BuyFormState
    setForm: (form: BuyFormState) => void
    accounts: Account[]
    onSubmit: (e: FormEvent) => void
    saving: boolean
    onFileUpload: (e: ChangeEvent<HTMLInputElement>, setter: any, state: any) => void
    onAnalyzeReceipt: (e: ChangeEvent<HTMLInputElement>) => void
    isAnalyzing: boolean
}

export function BuyInvestmentModal({
    isOpen,
    onClose,
    form,
    setForm,
    accounts,
    onSubmit,
    saving,
    onFileUpload,
    onAnalyzeReceipt,
    isAnalyzing
}: BuyInvestmentModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">Yeni Yatırım Al</h3>
                    <button onClick={onClose} className="text-stone-500 hover:text-white text-xl">✕</button>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4 relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 text-6xl opacity-10">✨</div>
                    <h4 className="font-bold text-amber-500 mb-2 flex items-center gap-2">
                        <span>🤖</span> Fiş / Fatura ile Otomatik Doldur
                    </h4>
                    <p className="text-xs text-stone-400 mb-4">
                        Döviz veya altın alım fişinizi yükleyin, yapay zeka sizin için formu otomatik doldursun.
                    </p>
                    
                    <div className="relative">
                        <input 
                            type="file"
                            accept="image/*"
                            onChange={onAnalyzeReceipt}
                            disabled={isAnalyzing}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed transition-colors ${isAnalyzing ? 'bg-stone-800 border-stone-600 text-stone-400' : 'bg-stone-900 border-amber-500/50 text-amber-400 hover:bg-amber-500/10'}`}>
                            {isAnalyzing ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-stone-400 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="font-medium text-sm">Yapay Zeka Fişi İnceliyor...</span>
                                </>
                            ) : (
                                <>
                                    <span className="text-lg">📸</span>
                                    <span className="font-bold text-sm">Fotoğraf Çek / Yükle</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                
                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label className="text-stone-400 text-sm mb-1 block">Yatırım Aracı</label>
                        <div className="grid grid-cols-4 gap-2">
                            {['gold', 'usd', 'eur', 'real_estate'].map((type) => (
                                <button 
                                    key={type}
                                    type="button"
                                    onClick={() => setForm({...form, asset_type: type as any})}
                                    className={`py-3 px-1 rounded-xl font-bold border flex flex-col items-center gap-1 transition-all ${form.asset_type === type ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'bg-stone-950 border-stone-800 text-stone-500 hover:border-stone-700 hover:text-stone-300'}`}
                                >
                                    <span className="text-2xl">{type === 'gold' ? '🥇' : type === 'usd' ? '💵' : type === 'eur' ? '💶' : '🏠'}</span>
                                    <span className="text-[10px] uppercase">{type === 'gold' ? 'Gr Altın' : type === 'real_estate' ? 'Emlak' : type}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {form.asset_type !== 'real_estate' ? (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block">Miktar</label>
                                <input 
                                    type="number"
                                    required
                                    step="0.0001"
                                    min="0.0001"
                                    value={form.quantity}
                                    onChange={(e) => setForm({...form, quantity: e.target.value})}
                                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 text-lg font-bold"
                                    placeholder={form.asset_type === 'gold' ? "Örn: 10" : "Örn: 500"}
                                />
                            </div>
                            <div>
                                <label className="text-stone-400 text-sm mb-1 block text-amber-500/80">Alış Fiyatı (1 Birim - ₺)</label>
                                <input 
                                    type="number"
                                    required
                                    step="0.0001"
                                    min="0.0001"
                                    value={form.price_per_unit}
                                    onChange={(e) => setForm({...form, price_per_unit: e.target.value})}
                                    className="w-full bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 focus:outline-none focus:border-amber-400 text-lg font-bold"
                                    placeholder="Kuru girin..."
                                />
                                <p className="text-[10px] text-stone-500 mt-1">Canlı kur otomatik yansıdı, değiştirebilirsiniz.</p>
                            </div>
                        </div>
                    ) : (
                        <div>
                            <label className="text-stone-400 text-sm mb-1 block text-amber-500/80">Gayrimenkul Toplam Maliyeti (₺)</label>
                            <input 
                                type="number"
                                required
                                step="1"
                                min="1"
                                value={form.price_per_unit}
                                onChange={(e) => setForm({...form, price_per_unit: e.target.value})}
                                className="w-full bg-amber-500/5 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-400 focus:outline-none focus:border-amber-400 text-lg font-bold"
                                placeholder="Örn: 3000000"
                            />
                            <p className="text-[10px] text-stone-500 mt-1">Tapu masrafları dahil toplam cepten çıkan tutarı girin.</p>
                        </div>
                    )}

                    <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 flex justify-between items-center">
                        <span className="text-stone-400 font-bold">Ödenecek Toplam Tutar:</span>
                        <span className="text-xl font-bold text-red-400">{formatCurrency(((form.asset_type === 'real_estate' ? 1 : (parseFloat(form.quantity) || 0)) * (parseFloat(form.price_per_unit) || 0)))}
                        </span>
                    </div>

                    <div>
                        <label className="text-stone-400 text-sm mb-1 block">Ödemenin Çıkacağı Hesap</label>
                        <select 
                            required
                            value={form.account_id}
                            onChange={(e) => setForm({...form, account_id: e.target.value})}
                            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 font-medium"
                        >
                            <option value="" disabled>Hesap Seçin...</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name} (Bakiye:{formatCurrency(acc.balance)})</option>
                            ))}
                        </select>
                    </div>

                    <div className="pt-4 border-t border-stone-800 space-y-4 mt-2">
                        <div>
                            <label className="text-stone-400 text-sm mb-1 block">Alım/İşlem Tarihi</label>
                            <input 
                                type="date"
                                value={form.purchase_date}
                                onChange={(e) => setForm({...form, purchase_date: e.target.value})}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400"
                            />
                        </div>

                        <div>
                            <label className="text-stone-400 text-sm mb-1 block">Dekont / Belge Yükle (Opsiyonel)</label>
                            <input 
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => onFileUpload(e, setForm, form)}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-400 focus:outline-none focus:border-amber-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-amber-500 file:text-stone-950 hover:file:bg-amber-400"
                            />
                            {form.document_url && <p className="text-xs text-green-400 mt-2">✓ Belge eklendi</p>}
                        </div>

                        <div>
                            <label className="text-stone-400 text-sm mb-1 block">Açıklama / Notlar (Opsiyonel)</label>
                            <textarea 
                                rows={2}
                                value={form.notes}
                                onChange={(e) => setForm({...form, notes: e.target.value})}
                                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-400 resize-none"
                                placeholder="Ada, Parsel, Araç takası gibi notlar..."
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving || !form.price_per_unit || !form.account_id || (form.asset_type !== 'real_estate' && !form.quantity)}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-4 rounded-xl transition-colors disabled:opacity-50 mt-4 text-lg"
                    >
                        {saving ? 'İşleniyor...' : 'Yatırımı Onayla ve Hesaptan Düş'}
                    </button>
                </form>
            </div>
        </div>
    )
}
