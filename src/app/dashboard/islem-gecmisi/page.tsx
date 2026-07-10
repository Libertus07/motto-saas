'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { formatCurrency, formatDate } from "@/lib/format";

type ActivityLog = {
    id: string
    created_at: string
    module: string
    action_type: 'EKLEME' | 'SILME' | 'GUNCELLEME'
    description: string
    details?: any
    user_id: string
}

export default function IslemGecmisi() {
    const [logs, setLogs] = useState<ActivityLog[]>([])
    const [loading, setLoading] = useState(true)
    const [activeFilter, setActiveFilter] = useState<string>('Tümü')
    const [actionFilter, setActionFilter] = useState<string>('Tümü')
    const [searchTerm, setSearchTerm] = useState('')
    const [expandedDates, setExpandedDates] = useState<string[]>(['Bugün'])
    const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null)

    const supabase = createClient()

    useEffect(() => {
        fetchLogs()
    }, [])

    const fetchLogs = async () => {
        setLoading(true)
        const { data, error } = await supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })

        if (!error && data) {
            setLogs(data)
        }
        setLoading(false)
    }

    const processedLogs = useMemo(() => {
        return logs.filter(log => {
            const matchModule = activeFilter === 'Tümü' || log.module === activeFilter
            const matchAction = actionFilter === 'Tümü' || log.action_type === actionFilter
            const matchSearch = searchTerm === '' || log.description.toLowerCase().includes(searchTerm.toLowerCase()) || log.user_id.toLowerCase().includes(searchTerm.toLowerCase())
            return matchModule && matchAction && matchSearch
        })
    }, [logs, activeFilter, actionFilter, searchTerm])

    const groupedLogs = useMemo(() => {
        const groups: Record<string, ActivityLog[]> = {}
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)

        processedLogs.forEach(log => {
            const date = new Date(log.created_at)
            let dateKey = formatDate(date)
            
            if (date.toDateString() === today.toDateString()) {
                dateKey = 'Bugün'
            } else if (date.toDateString() === yesterday.toDateString()) {
                dateKey = 'Dün'
            }

            if (!groups[dateKey]) {
                groups[dateKey] = []
            }
            groups[dateKey].push(log)
        })
        return groups
    }, [processedLogs])

    const toggleDate = (dateKey: string) => {
        setExpandedDates(prev => prev.includes(dateKey) ? prev.filter(d => d !== dateKey) : [...prev, dateKey])
    }

    const modules = ['Tümü', ...Array.from(new Set(logs.map(l => l.module)))]

    const getModulePath = (moduleName: string) => {
        const map: Record<string, string> = {
            'Ürünler': '/dashboard/urunler',
            'Tedarikçi': '/dashboard/tedarikciler',
            'Üretim Reçetesi': '/dashboard/yari-mamuller',
            'Hammadde': '/dashboard/hammaddeler',
            'Stok': '/dashboard/stok',
            'Giderler': '/dashboard/giderler',
            'Ayarlar': '/dashboard/ayarlar',
        }
        return map[moduleName] || null
    }

    return (
        <div className="min-h-full bg-stone-950 text-white">
            <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <span className="text-2xl">🕵️‍♂️</span>
                    <div>
                        <h1 className="font-bold text-amber-400 text-lg">İşlem Geçmişi (Audit Log)</h1>
                        <p className="text-xs text-stone-400">Sistemde yapılan kritik değişikliklerin ve silinen verilerin kaydı.</p>
                    </div>
                </div>
            </header>

            <main className="p-6 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="flex flex-wrap gap-2 flex-1">
                        {modules.map(mod => (
                            <button
                                key={mod}
                                onClick={() => setActiveFilter(mod)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                                    activeFilter === mod 
                                    ? 'bg-amber-500 text-stone-950' 
                                    : 'bg-stone-900 border border-stone-800 text-stone-400 hover:text-white hover:bg-stone-800'
                                }`}
                            >
                                {mod}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <input 
                            type="text"
                            placeholder="Açıklama veya Kullanıcı ara..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="bg-stone-900 border border-stone-800 rounded-lg px-4 py-2 text-sm w-full md:w-64 focus:outline-none focus:border-amber-500"
                        />
                        <select 
                            value={actionFilter}
                            onChange={e => setActionFilter(e.target.value)}
                            className="bg-stone-900 border border-stone-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-amber-500"
                        >
                            <option value="Tümü">Tüm İşlemler</option>
                            <option value="EKLEME">Ekleme</option>
                            <option value="SILME">Silme</option>
                            <option value="GUNCELLEME">Güncelleme</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-4">
                    {loading ? (
                        <div className="bg-stone-900 rounded-xl border border-stone-800 p-12 text-center text-stone-500">
                            <div className="animate-spin text-amber-500 text-2xl mb-2">⚙️</div>
                            Loglar yükleniyor...
                        </div>
                    ) : Object.keys(groupedLogs).length === 0 ? (
                        <div className="bg-stone-900 rounded-xl border border-stone-800 p-12 text-center text-stone-500">
                            Bu kriterlerde işlem geçmişi bulunamadı.
                        </div>
                    ) : (
                        Object.entries(groupedLogs).map(([dateKey, groupLogs]) => {
                            const isExpanded = expandedDates.includes(dateKey)
                            return (
                                <div key={dateKey} className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
                                    <button 
                                        onClick={() => toggleDate(dateKey)}
                                        className="w-full flex items-center justify-between px-6 py-4 bg-stone-800/30 hover:bg-stone-800/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg">{dateKey === 'Bugün' ? '📅' : dateKey === 'Dün' ? '⏱️' : '🗓️'}</span>
                                            <h3 className="font-bold text-stone-200">{dateKey}</h3>
                                            <span className="bg-stone-800 text-xs px-2 py-1 rounded-full text-stone-400 border border-stone-700">{groupLogs.length} işlem</span>
                                        </div>
                                        <span className="text-stone-500 text-sm font-bold bg-stone-800 w-8 h-8 flex items-center justify-center rounded-lg">{isExpanded ? '▲' : '▼'}</span>
                                    </button>
                                    
                                    {isExpanded && (
                                        <div className="overflow-x-auto border-t border-stone-800">
                                            <table className="w-full text-left">
                                                <thead className="bg-stone-800/20 text-stone-500 text-xs uppercase tracking-wider border-b border-stone-800">
                                                    <tr>
                                                        <th className="px-6 py-3 font-medium">Saat</th>
                                                        <th className="px-6 py-3 font-medium">Modül</th>
                                                        <th className="px-6 py-3 font-medium">İşlem Tipi</th>
                                                        <th className="px-6 py-3 font-medium">Açıklama</th>
                                                        <th className="px-6 py-3 font-medium">Kullanıcı</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-stone-800/50">
                                                    {groupLogs.map(log => (
                                                        <tr 
                                                            key={log.id} 
                                                            onClick={() => setSelectedLog(log)}
                                                            className="hover:bg-stone-800/40 transition-colors cursor-pointer"
                                                        >
                                                            <td className="px-6 py-4 text-sm text-stone-400 whitespace-nowrap">
                                                                {formatDate(new Date(log.created_at))}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="inline-block whitespace-nowrap bg-stone-800 text-stone-300 px-2 py-1 rounded text-xs border border-stone-700">
                                                                    {log.module}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                {log.action_type === 'EKLEME' && <span className="inline-block whitespace-nowrap text-green-400 font-bold text-[10px] uppercase tracking-wider bg-green-500/10 px-2 py-1 rounded border border-green-500/20">➕ Ekleme</span>}
                                                                {log.action_type === 'SILME' && <span className="inline-block whitespace-nowrap text-red-400 font-bold text-[10px] uppercase tracking-wider bg-red-500/10 px-2 py-1 rounded border border-red-500/20">🗑️ Silme</span>}
                                                                {log.action_type === 'GUNCELLEME' && <span className="inline-block whitespace-nowrap text-blue-400 font-bold text-[10px] uppercase tracking-wider bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">🔄 Güncelleme</span>}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <p className="text-stone-300 font-medium text-sm">{log.description}</p>
                                                                {log.details?.detay && typeof log.details.detay === 'string' && (
                                                                    <p className="text-stone-500 text-xs mt-1 truncate max-w-md">
                                                                        {log.details.detay.replace(/[()]/g, '')}
                                                                    </p>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-stone-500">
                                                                {log.user_id}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            </main>

            {/* Detay Modalı */}
            {selectedLog && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setSelectedLog(null)}>
                    <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-2xl w-full p-6 shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <button 
                            onClick={() => setSelectedLog(null)}
                            className="absolute top-4 right-4 text-stone-500 hover:text-white text-2xl leading-none"
                        >
                            &times;
                        </button>
                        <div className="flex items-center gap-3 mb-6">
                            <span className="text-2xl">📋</span>
                            <h2 className="text-xl font-bold text-amber-400">İşlem Detayları</h2>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="bg-stone-800/50 p-3 rounded-lg border border-stone-800">
                                    <p className="text-stone-500 text-xs mb-1">Tarih / Saat</p>
                                    <p className="text-stone-200 text-sm font-medium">
                                        {formatDate(new Date(selectedLog.created_at))}
                                    </p>
                                </div>
                                <div className="bg-stone-800/50 p-3 rounded-lg border border-stone-800">
                                    <p className="text-stone-500 text-xs mb-1">Kullanıcı</p>
                                    <p className="text-stone-200 text-sm font-medium">{selectedLog.user_id}</p>
                                </div>
                                <div className="bg-stone-800/50 p-3 rounded-lg border border-stone-800">
                                    <p className="text-stone-500 text-xs mb-1">Modül</p>
                                    <p className="text-amber-400 text-sm font-bold">{selectedLog.module}</p>
                                </div>
                                <div className="bg-stone-800/50 p-3 rounded-lg border border-stone-800">
                                    <p className="text-stone-500 text-xs mb-1">İşlem Tipi</p>
                                    <p className="text-stone-200 text-sm font-medium">{selectedLog.action_type}</p>
                                </div>
                                {selectedLog.details?._meta?.ip && (
                                    <div className="bg-stone-800/50 p-3 rounded-lg border border-stone-800">
                                        <p className="text-stone-500 text-xs mb-1">IP Adresi</p>
                                        <p className="text-stone-200 text-sm font-medium">{selectedLog.details._meta.ip}</p>
                                    </div>
                                )}
                                {selectedLog.details?._meta?.userAgent && (
                                    <div className="bg-stone-800/50 p-3 rounded-lg border border-stone-800">
                                        <p className="text-stone-500 text-xs mb-1">Cihaz / Tarayıcı</p>
                                        <p className="text-stone-200 text-sm font-medium truncate" title={selectedLog.details._meta.userAgent}>
                                            {selectedLog.details._meta.userAgent.split(' ')[0]}...
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-stone-800/50 p-4 rounded-lg border border-stone-800">
                                <p className="text-stone-500 text-xs mb-2">Genel Açıklama</p>
                                <p className="text-stone-200 text-sm font-medium leading-relaxed">{selectedLog.description}</p>
                            </div>

                            {selectedLog.details && (
                                <div className="bg-stone-800/50 p-4 rounded-lg border border-stone-800">
                                    <p className="text-stone-500 text-xs mb-3 font-bold uppercase tracking-wider">Veri Değişiklikleri</p>
                                    <div className="max-h-64 overflow-y-auto pr-2 space-y-3">
                                        {typeof selectedLog.details === 'string' ? (
                                            <p className="text-sm text-stone-300 bg-stone-950 p-3 rounded-lg border border-stone-800">{selectedLog.details}</p>
                                        ) : (
                                            <>
                                                {/* Detay stringi varsa özel renderla */}
                                                {selectedLog.details.detay && typeof selectedLog.details.detay === 'string' && (
                                                    <div className="space-y-3 mb-3">
                                                        {selectedLog.details.detay.split('|').map((item: string, itemIdx: number) => {
                                                            let title = '';
                                                            let changeText = item.trim();
                                            
                                                            if (changeText.includes('(')) {
                                                                const parts = changeText.split('(');
                                                                title = parts[0].trim();
                                                                changeText = parts[1].replace(')', '').trim();
                                                            }

                                                            const formatTitle = (t: string) => {
                                                                const dict: Record<string, string> = {
                                                                    business_logo: 'İşletme Logosu',
                                                                    business_name: 'İşletme Adı',
                                                                }
                                                                return dict[t] || t
                                                            }
                                                            const formattedTitle = formatTitle(title);
                                                            const getLabel = (prefix: string) => {
                                                                if (formattedTitle.toLowerCase().includes('logo')) return `${prefix} Logo`;
                                                                if (formattedTitle.toLowerCase().includes('belge') || formattedTitle.toLowerCase().includes('fiş')) return `${prefix} Belge`;
                                                                return `${prefix} Değer`;
                                                            }
                                                            
                                                            const renderDiffVal = (val: string, colorClass: string) => {
                                                                if (!val || val === 'undefined') return <span className="text-stone-600 italic">Boş</span>;
                                                                if (val.startsWith('http') && (val.includes('.png') || val.includes('.jpg') || val.includes('.jpeg') || val.includes('supabase.co'))) {
                                                                    return <img src={val} alt="preview" className="h-16 w-auto rounded object-contain bg-stone-900 p-1 border border-stone-700 shadow-sm" />
                                                                }
                                                                return <span className={`${colorClass} break-all text-center`}>{val}</span>
                                                            }
                                            
                                                            const changes = changeText.split(',');
                                            
                                                            return (
                                                                <div key={itemIdx} className="bg-stone-950 p-3 rounded-lg border border-stone-800 w-full overflow-hidden">
                                                                    {title && <p className="text-amber-500 font-bold mb-3 text-sm text-center border-b border-stone-800/60 pb-2">{formattedTitle}</p>}
                                                                    <ul className="space-y-2 w-full">
                                                                        {changes.map((ch: string, idx: number) => {
                                                                            const cleanCh = ch.trim();
                                                                            if (!cleanCh) return null;
                                            
                                                                            if (cleanCh.includes('->')) {
                                                                                const [labelSide, newValue] = cleanCh.split('->');
                                                                                return (
                                                                                    <li key={idx} className="flex items-center justify-between gap-4 bg-stone-900/50 p-4 rounded-lg border border-stone-800/60 w-full text-center">
                                                                                        <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                                                                                            <p className="text-[10px] text-stone-500 uppercase tracking-wider mb-2 font-medium">{getLabel('Eski')}</p>
                                                                                            {renderDiffVal(labelSide.trim(), "text-stone-300")}
                                                                                        </div>
                                                                                        <div className="flex-shrink-0 flex items-center justify-center bg-stone-800 w-8 h-8 rounded-full border border-stone-700 shadow-inner relative z-10">
                                                                                            <span className="text-stone-400 text-sm">➔</span>
                                                                                        </div>
                                                                                        <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                                                                                            <p className="text-[10px] text-amber-500/70 uppercase tracking-wider mb-2 font-medium">{getLabel('Yeni')}</p>
                                                                                            {renderDiffVal(newValue.trim(), "font-bold text-amber-400")}
                                                                                        </div>
                                                                                    </li>
                                                                                )
                                                                            }
                                            
                                                                            return (
                                                                                <li key={idx} className="flex items-center gap-2 text-sm text-stone-300">
                                                                                    <span className="text-amber-500 text-xs">❖</span> {cleanCh}
                                                                                </li>
                                                                            )
                                                                        })}
                                                                    </ul>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}

                                                {/* Diğer keyleri renderla */}
                                                {Object.entries(selectedLog.details)
                                                    .filter(([k]) => k !== '_meta' && k !== 'detay')
                                                    .map(([key, value]) => {
                                                        const formatKey = (k: string) => {
                                                            const dict: Record<string, string> = {
                                                                amount: 'Tutar', note: 'Açıklama / Not', business_logo: 'İşletme Logosu',
                                                                business_name: 'İşletme Adı', totalItems: 'Toplam Kalem', totalAmount: 'Toplam Tutar',
                                                                batchId: 'İşlem Grubu (ID)', batch_id: 'İşlem Grubu (ID)', recipeId: 'Kayıt ID',
                                                                productId: 'Kayıt ID', materialId: 'Kayıt ID', expenseId: 'Kayıt ID',
                                                                paymentMethod: 'Ödeme Yöntemi', documentUrl: 'Belge/Fiş', transaction: 'İşlem Detayı'
                                                            }
                                                            return dict[k] || k
                                                        }
                                                        
                                                        const renderValue = (v: any) => {
                                                            if (typeof v === 'string' && v.startsWith('http') && (v.includes('.png') || v.includes('.jpg') || v.includes('.jpeg') || v.includes('supabase.co'))) {
                                                                return (
                                                                    <div className="mt-1">
                                                                        <img src={v} alt="preview" className="max-h-24 w-auto rounded object-contain border border-stone-700 bg-stone-900 p-1" />
                                                                    </div>
                                                                )
                                                            }
                                                            return <span className="text-stone-200 text-sm break-all font-medium">{String(v)}</span>
                                                        }

                                                        if (typeof value === 'object' && value !== null) {
                                                            return (
                                                                <div key={key} className="flex flex-col gap-2 bg-stone-950 px-4 py-3 rounded-lg border border-stone-800">
                                                                    <span className="text-stone-500 text-xs font-bold uppercase">{formatKey(key)}</span>
                                                                    <div className="bg-stone-900/50 p-3 rounded border border-stone-800/50 flex flex-col gap-1.5">
                                                                        {Object.entries(value).map(([subK, subV]) => (
                                                                            <div key={subK} className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                                                <span className="text-stone-500 text-xs min-w-[120px]">{formatKey(subK)}:</span>
                                                                                {renderValue(subV)}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )
                                                        }
                                                        
                                                        return (
                                                            <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-start gap-4 bg-stone-950 px-4 py-3 rounded-lg border border-stone-800">
                                                                <span className="text-stone-500 text-xs font-bold uppercase min-w-[120px]">{formatKey(key)}</span>
                                                                {renderValue(value)}
                                                            </div>
                                                        )
                                                    })}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        <div className="mt-6 flex justify-between items-center border-t border-stone-800 pt-6">
                            {getModulePath(selectedLog.module) ? (
                                <Link 
                                    href={getModulePath(selectedLog.module) as string} 
                                    className="text-amber-400 hover:text-amber-300 text-sm font-bold transition-colors flex items-center gap-2 bg-amber-500/10 px-4 py-2 rounded-lg"
                                >
                                    🔗 İlgili Sayfaya Git
                                </Link>
                            ) : (
                                <div />
                            )}
                            <button 
                                onClick={() => setSelectedLog(null)}
                                className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                Kapat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
