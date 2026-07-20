import React, { Fragment } from 'react'
import { Material } from '../../types'

type InventoryCountTabProps = {
    materials: Material[]
    sayimData: { [key: string]: string }
    searchTerm: string
    onSearchChange: (value: string) => void
    onSayimDataChange: (id: string, value: string) => void
    onSubmitSayim: () => void
    onCancelSayim: () => void
}

export function InventoryCountTab({
    materials, sayimData, searchTerm,
    onSearchChange, onSayimDataChange, onSubmitSayim, onCancelSayim
}: InventoryCountTabProps) {

    const filteredSayimMaterials = materials.filter(mat => mat.name.toLowerCase().includes(searchTerm.toLowerCase()))

    const handleSayimKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            const nextInput = document.getElementById(`sayim-input-${currentIndex + 1}`)
            if (nextInput) {
                nextInput.focus()
                ;(nextInput as HTMLInputElement).select()
            }
        }
    }

    const pendingAdjustmentsCount = Object.keys(sayimData).length

    return (
        <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
            <div className="p-4 bg-stone-800/30 border-b border-stone-800 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="w-full md:w-1/3">
                    <input
                        type="text"
                        placeholder="Hammadde ara (sayım için)..."
                        value={searchTerm}
                        onChange={e => onSearchChange(e.target.value)}
                        className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-400"
                    />
                </div>
                <div className="flex gap-3">
                    <span className="text-stone-400 text-sm flex items-center bg-stone-950 px-3 rounded-lg border border-stone-800">
                        Hızlı geçiş için Enter ↵ tuşunu kullanabilirsiniz
                    </span>
                    <button
                        onClick={onSubmitSayim}
                        className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
                    >
                        Sayımı Tamamla {pendingAdjustmentsCount > 0 && `(${pendingAdjustmentsCount})`}
                    </button>
                    {pendingAdjustmentsCount > 0 && (
                        <button
                            onClick={onCancelSayim}
                            className="bg-stone-700 hover:bg-stone-600 text-white px-4 py-2 rounded-lg transition-colors"
                        >
                            İptal
                        </button>
                    )}
                </div>
            </div>
            
            <div className="overflow-x-auto w-full">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-stone-800">
                            <th className="text-left px-4 py-3 text-stone-400 text-sm w-1/3">Hammadde</th>
                            <th className="text-center px-4 py-3 text-stone-400 text-sm">Sistemdeki Stok</th>
                            <th className="text-center px-4 py-3 text-stone-400 text-sm">Gerçek (Sayılan) Stok</th>
                            <th className="text-right px-4 py-3 text-stone-400 text-sm">Fark</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSayimMaterials.map((mat, index) => {
                            const sayimValue = sayimData[mat.id]
                            const currentStock = mat.stock_quantity || 0
                            const diff = sayimValue !== undefined && sayimValue !== '' ? parseFloat(sayimValue) - currentStock : 0
                            const hasDiff = diff !== 0

                            return (
                                <tr key={mat.id} className="border-b border-stone-800/50 hover:bg-stone-800/30 transition-colors">
                                    <td className="px-4 py-3 font-medium text-stone-200">{mat.name}</td>
                                    <td className="px-4 py-3 text-center text-stone-400">
                                        {currentStock} {mat.unit}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-center items-center gap-2">
                                            <input
                                                id={`sayim-input-${index}`}
                                                type="number"
                                                value={sayimValue || ''}
                                                onChange={e => onSayimDataChange(mat.id, e.target.value)}
                                                onKeyDown={e => handleSayimKeyDown(e, index)}
                                                className={`w-32 bg-stone-950 border rounded-lg px-3 py-2 text-center text-white focus:outline-none focus:border-amber-400 transition-colors ${sayimValue !== undefined && sayimValue !== '' ? (hasDiff ? 'border-amber-500/50 bg-amber-900/10' : 'border-green-500/50 bg-green-900/10') : 'border-stone-700'}`}
                                                placeholder={currentStock.toString()}
                                            />
                                            <span className="text-stone-500 text-sm w-8">{mat.unit}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold w-32">
                                        {sayimValue === undefined || sayimValue === '' ? (
                                            <span className="text-stone-600">-</span>
                                        ) : diff === 0 ? (
                                            <span className="text-green-500">✓ Eşit</span>
                                        ) : diff > 0 ? (
                                            <span className="text-green-400">+{diff} {mat.unit}</span>
                                        ) : (
                                            <span className="text-red-400">{diff} {mat.unit}</span>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                        {filteredSayimMaterials.length === 0 && (
                            <tr>
                                <td colSpan={4} className="text-center py-8 text-stone-400">Bu aramaya uygun hammadde bulunamadı.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
