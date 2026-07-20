import { EnhancedInvestment } from '../types'
import { InvestmentTransaction } from '@/types/database'
import { formatCurrency, formatDate } from "@/lib/format"

type InvestmentsListProps = {
    loading: boolean
    groupedInvestments: Record<string, EnhancedInvestment[]>
    groupBy: 'type' | 'month'
    transactions: InvestmentTransaction[]
    expandedInvestment: string | null
    setExpandedInvestment: (id: string | null) => void
    onRent: (inv: EnhancedInvestment) => void
    onUpdateValue: (inv: EnhancedInvestment) => void
    onNote: (note: string) => void
    onDoc: (url: string) => void
    onEdit: (inv: EnhancedInvestment) => void
    onDelete: (id: string) => void
}

export function InvestmentsList({
    loading,
    groupedInvestments,
    groupBy,
    transactions,
    expandedInvestment,
    setExpandedInvestment,
    onRent,
    onUpdateValue,
    onNote,
    onDoc,
    onEdit,
    onDelete
}: InvestmentsListProps) {

    const renderInvestmentList = (investmentList: EnhancedInvestment[]) => {
        return investmentList.map(inv => {
            const isExpanded = expandedInvestment === inv.id;
            const invTransactions = transactions.filter((t: InvestmentTransaction) => t.investment_id === inv.id);

            return (
            <div key={inv.id} className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden transition-all duration-200">
                <div 
                    onClick={() => setExpandedInvestment(isExpanded ? null : inv.id)}
                    className="w-full px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between hover:bg-stone-800/30 transition-colors cursor-pointer gap-4"
                >
                    <div className="flex-1 flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-stone-950 border border-stone-800 flex items-center justify-center text-2xl shadow-inner shrink-0">
                            {inv.asset_type === 'gold' ? '🥇' : inv.asset_type === 'usd' ? '💵' : inv.asset_type === 'eur' ? '💶' : '🏠'}
                        </div>
                        <div>
                            <h4 className="font-bold text-stone-200 text-lg">{inv.name}</h4>
                            <p className="text-xs text-stone-500 mt-0.5">
                                {!inv.isRE && <span className="font-medium text-stone-400 mr-2">{formatCurrency(inv.quantity)} {inv.asset_type === 'gold' ? 'Gram' : inv.asset_type === 'usd' ? 'USD' : 'EUR'}</span>}
                                {inv.purchase_date && <span>📅 {formatDate(new Date(inv.purchase_date))}</span>}
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6 justify-between sm:justify-end w-full sm:w-auto pl-16 sm:pl-0">
                        <div className="text-left sm:text-right">
                            <p className="text-stone-400 text-xs font-bold mb-0.5">Güncel Değer</p>
                            <p className="text-lg font-bold text-white">{formatCurrency(inv.currentValue)}</p>
                            <p className={`text-xs font-bold mt-0.5 ${inv.isProfit ? 'text-green-400' : 'text-red-400'}`}>
                                {inv.isProfit ? 'Kâr: +' : 'Zarar: '}{formatCurrency(inv.profit)}
                            </p>
                        </div>
                        
                        <div className={`text-stone-500 p-2 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                            ▼
                        </div>
                    </div>
                </div>

                {isExpanded && (
                    <div className="border-t border-stone-800 bg-stone-900/50">
                        <div className="px-5 py-3 border-b border-stone-800 flex flex-wrap gap-2 items-center bg-stone-950/30">
                            {inv.isRE && (
                                <>
                                    <button onClick={() => onRent(inv)} className="bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-600/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>💰</span> Kira Tahsil Et</button>
                                    <button onClick={() => onUpdateValue(inv)} className="bg-stone-800 hover:bg-stone-700 text-white border border-stone-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>📈</span> Değeri Güncelle</button>
                                </>
                            )}
                            {inv.notes && <button onClick={() => onNote(inv.notes!)} className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>📝</span> Notlar</button>}
                            {inv.document_url && <button onClick={() => onDoc(inv.document_url!)} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-600/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>📎</span> Belge</button>}
                            <button onClick={() => onEdit(inv)} className="bg-stone-800 hover:bg-amber-500/20 text-stone-400 hover:text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>✏️</span> Düzenle</button>
                            <button onClick={() => onDelete(inv.id)} className="bg-stone-800 hover:bg-red-500/20 text-stone-400 hover:text-red-400 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"><span>🗑️</span> Sil</button>
                        </div>

                        <div className="overflow-x-auto w-full">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-stone-800/30 text-stone-400 border-b border-stone-800">
                                    <tr>
                                        <th className="px-5 py-2.5 font-medium">İşlem Tarihi</th>
                                        <th className="px-5 py-2.5 font-medium">İşlem Türü</th>
                                        <th className="px-5 py-2.5 font-medium">Açıklama / Not</th>
                                        <th className="px-5 py-2.5 font-medium text-right">Tutar / Değer</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-800/50">
                                    {invTransactions.length === 0 ? (
                                        <tr><td colSpan={4} className="px-5 py-4 text-center text-stone-500">Bu yatırıma ait hiçbir hareket bulunamadı.</td></tr>
                                    ) : (
                                        invTransactions.map(tx => (
                                            <tr key={tx.id} className="hover:bg-stone-800/20 transition-colors">
                                                <td className="px-5 py-3 text-stone-400 whitespace-nowrap">
                                                    {tx.created_at ? formatDate(new Date(tx.created_at)) : '-'}
                                                </td>
                                                <td className="px-5 py-3">
                                                    <span className={`px-2 py-1 rounded-md text-xs font-bold border ${
                                                        tx.transaction_type === 'buy' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                        tx.transaction_type === 'rent' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                        tx.transaction_type === 'value_update' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                        'bg-stone-800 text-stone-400 border-stone-700'
                                                    }`}>
                                                        {tx.transaction_type === 'buy' ? 'İlk Alım' :
                                                         tx.transaction_type === 'rent' ? 'Kira Geliri' :
                                                         tx.transaction_type === 'value_update' ? 'Değer Güncellemesi' :
                                                         tx.transaction_type === 'sell' ? 'Satış' : 'İşlem'}
                                                    </span>
                                                </td>
                                                <td className="px-5 py-3 text-stone-300">
                                                    {tx.notes || '-'}
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-white whitespace-nowrap">
                                                    {tx.transaction_type === 'value_update' ? '' : (tx.transaction_type === 'buy' ? '-' : '+')}{formatCurrency(tx.total_amount)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            )
        })
    }

    if (loading) return <div className="text-stone-500 py-10 text-center">Yükleniyor...</div>

    if (Object.keys(groupedInvestments).length === 0) {
        return (
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-10 text-center text-stone-500">
                Henüz bir yatırımınız bulunmuyor. "Yeni Yatırım Yap" butonuyla ilk varlığınızı ekleyebilirsiniz.
            </div>
        )
    }

    return (
        <div className="space-y-3">
            {Object.entries(groupedInvestments).map(([groupName, items], index) => {
                const groupTotalValue = items.reduce((sum, i) => sum + i.currentValue, 0)
                const groupTotalCost = items.reduce((sum, i) => sum + i.costValue, 0)
                const groupTotalRent = items.reduce((sum, i) => sum + i.invRentIncome, 0)
                const groupProfit = (groupTotalValue - groupTotalCost) + groupTotalRent
                const isGroupProfit = groupProfit >= 0

                return (
                    <details key={groupName} className="group bg-stone-900 border border-stone-800 rounded-xl overflow-hidden" open={index === 0}>
                        <summary className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 px-4 cursor-pointer hover:bg-stone-800/50 transition-colors list-none select-none">
                            <div className="flex items-center gap-3">
                                <span className="text-stone-500 transition-transform duration-300 group-open:rotate-90 text-sm">▶</span>
                                <h4 className="text-base font-bold text-amber-500">{groupName} <span className="text-stone-500 text-xs ml-2 font-medium">({items.length} Kayıt)</span></h4>
                            </div>
                            <div className="flex items-center gap-6 mt-3 sm:mt-0 text-sm pl-7 sm:pl-0">
                                <div>
                                    <span className="text-stone-500 mr-2 font-medium">Toplam Değer:</span>
                                    <span className="font-bold text-white">{formatCurrency(groupTotalValue)}</span>
                                </div>
                                <div className={`font-bold px-2 py-1 rounded-md ${isGroupProfit ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                    {isGroupProfit ? 'Kâr: +' : 'Zarar: '}{formatCurrency(groupProfit)}
                                </div>
                            </div>
                        </summary>
                        
                        <div className="p-3 pt-0 border-t border-stone-800/50 bg-stone-950/30">
                            {groupName === 'Gayrimenkul Mülkleri' || groupBy === 'month' ? (
                                <div className="flex flex-col gap-2 mt-3">
                                    {renderInvestmentList(items)}
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3 mt-3">
                                    {Object.entries(
                                        items.reduce((acc, curr) => {
                                            const dateStr = curr.purchase_date ? formatDate(new Date(curr.purchase_date)) : 'Tarih Belirtilmeyenler'
                                            if (!acc[dateStr]) acc[dateStr] = []
                                            acc[dateStr].push(curr)
                                            return acc
                                        }, {} as Record<string, typeof items>)
                                    ).map(([monthName, monthItems]) => (
                                        <details key={monthName} className="group/month bg-stone-900 border border-stone-800/50 rounded-lg overflow-hidden" open>
                                            <summary className="flex items-center justify-between p-2 px-4 cursor-pointer hover:bg-stone-800/30 list-none select-none border-b border-stone-800/30">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-stone-600 transition-transform duration-300 group-open/month:rotate-90 text-xs">▶</span>
                                                    <h5 className="font-bold text-stone-300 text-sm">{monthName}</h5>
                                                    <span className="text-xs text-stone-500">({monthItems.length} kayıt)</span>
                                                </div>
                                            </summary>
                                            <div className="p-2 pt-2 flex flex-col gap-2 bg-stone-950/20">
                                                {renderInvestmentList(monthItems)}
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            )}
                        </div>
                    </details>
                )
            })}
        </div>
    )
}
