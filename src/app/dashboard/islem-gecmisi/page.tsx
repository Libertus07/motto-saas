'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'

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
            let dateKey = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
            
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
            'Yarı Mamul': '/dashboard/yari-mamuller',
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
                                                                {new Date(log.created_at).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className="bg-stone-800 text-stone-300 px-2 py-1 rounded text-xs border border-stone-700">
                                                                    {log.module}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                {log.action_type === 'EKLEME' && <span className="text-green-400 font-bold text-[10px] uppercase tracking-wider bg-green-500/10 px-2 py-1 rounded border border-green-500/20">➕ Ekleme</span>}
                                                                {log.action_type === 'SILME' && <span className="text-red-400 font-bold text-[10px] uppercase tracking-wider bg-red-500/10 px-2 py-1 rounded border border-red-500/20">🗑️ Silme</span>}
                                                                {log.action_type === 'GUNCELLEME' && <span className="text-blue-400 font-bold text-[10px] uppercase tracking-wider bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">🔄 Güncelleme</span>}
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
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="bg-stone-800/50 p-3 rounded-lg border border-stone-800">
                                    <p className="text-stone-500 text-xs mb-1">Tarih / Saat</p>
                                    <p className="text-stone-200 text-sm font-medium">
                                        {new Date(selectedLog.created_at).toLocaleString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
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
                                    <div className="max-h-64 overflow-y-auto pr-2">
                                        {typeof selectedLog.details === 'string' ? (
                                            <p className="text-sm text-stone-300 bg-stone-950 p-3 rounded-lg border border-stone-800">{selectedLog.details}</p>
                                        ) : selectedLog.details.detay && typeof selectedLog.details.detay === 'string' ? (
                                            <div className="space-y-3">
                                                {selectedLog.details.detay.split('|').map((item: string, itemIdx: number) => {
                                                    let title = '';
                                                    let changeText = item.trim();
                                    
                                                    if (changeText.includes('(')) {
                                                        const parts = changeText.split('(');
                                                        title = parts[0].trim();
                                                        changeText = parts[1].replace(')', '').trim();
                                                    }
                                    
                                                    const changes = changeText.split(',');
                                    
                                                    return (
                                                        <div key={itemIdx} className="bg-stone-950 p-3 rounded-lg border border-stone-800">
                                                            {title && <p className="text-amber-500 font-bold mb-2 text-sm">{title}</p>}
                                                            <ul className="space-y-1.5">
                                                                {changes.map((ch: string, idx: number) => {
                                                                    const cleanCh = ch.trim();
                                                                    if (!cleanCh) return null;
                                    
                                                                    if (cleanCh.includes('->')) {
                                                                        const [labelSide, newValue] = cleanCh.split('->');
                                                                        return (
                                                                            <li key={idx} className="flex items-center gap-2 text-sm">
                                                                                <div className="flex items-center gap-3 bg-stone-900/50 px-3 py-1.5 rounded-md border border-stone-800/60">
                                                                                    <span className="text-stone-200">{labelSide.trim()}</span>
                                                                                    <span className="text-stone-600 text-xs">➔</span>
                                                                                    <span className="font-bold text-amber-400">{newValue.trim()}</span>
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
                                        ) : (
                                            <div className="space-y-2">
                                                {Object.entries(selectedLog.details).filter(([k]) => k !== '_meta').map(([key, value]) => {
                                                    if (typeof value === 'object' && value !== null) {
                                                        return (
                                                            <div key={key} className="flex flex-col gap-2 bg-stone-950 px-4 py-3 rounded-lg border border-stone-800">
                                                                <span className="text-stone-500 text-xs font-bold uppercase">{key}</span>
                                                                <div className="bg-stone-900/50 p-3 rounded border border-stone-800/50 flex flex-col gap-1.5">
                                                                    {Object.entries(value).map(([subK, subV]) => (
                                                                        <div key={subK} className="flex flex-col sm:flex-row sm:items-center gap-2">
                                                                            <span className="text-stone-500 text-xs min-w-[120px]">{subK}:</span>
                                                                            <span className="text-stone-300 text-sm font-mono break-all">{String(subV)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )
                                                    }
                                                    
                                                    return (
                                                        <div key={key} className="flex flex-col sm:flex-row sm:items-center justify-start gap-4 bg-stone-950 px-4 py-3 rounded-lg border border-stone-800">
                                                            <span className="text-stone-500 text-xs font-bold uppercase min-w-[100px]">{key}</span>
                                                            <span className="text-stone-200 text-sm break-all font-medium">
                                                                {String(value)}
                                                            </span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
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
