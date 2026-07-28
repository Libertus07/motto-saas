'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { formatCurrency, formatDate } from '@/lib/format'
import { HistoryAccordion } from '@/components/ui/HistoryAccordion'

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
      const matchSearch =
        searchTerm === '' ||
        log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.user_id || '').toLowerCase().includes(searchTerm.toLowerCase())
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

  // Counts for KPI Cards
  const stats = useMemo(() => {
    let ekleme = 0
    let guncelleme = 0
    let silme = 0

    logs.forEach(l => {
      if (l.action_type === 'EKLEME') ekleme++
      if (l.action_type === 'GUNCELLEME') guncelleme++
      if (l.action_type === 'SILME') silme++
    })

    return { total: logs.length, ekleme, guncelleme, silme }
  }, [logs])

  const modules = ['Tümü', ...Array.from(new Set(logs.map(l => l.module)))]

  const getModulePath = (moduleName: string) => {
    const map: Record<string, string> = {
      Ürünler: '/dashboard/urunler',
      Tedarikçi: '/dashboard/tedarikciler',
      'Üretim Reçetesi': '/dashboard/yari-mamuller',
      Hammadde: '/dashboard/hammaddeler',
      Stok: '/dashboard/stok',
      Giderler: '/dashboard/giderler',
      Ayarlar: '/dashboard/ayarlar'
    }
    return map[moduleName] || null
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      {/* ──────────────── HEADER BAR ──────────────── */}
      <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
              🕵️‍♂️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">
                  İşlem Geçmişi (Audit Log)
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                  Güvenlik & Sistem Aktivitesi
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                Sistemde gerçekleştirilen kritik değişiklikler, veri farkları ve kullanıcı eylem kayıtları.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ──────────────── MAIN CONTAINER ──────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* EXECUTIVE KPI METRIC CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Toplam İşlem Kaydı</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                📋
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">{stats.total} Aktivite</div>
            <div className="text-stone-400 text-[11px] mt-1">Kayıtlı Sistem Logu</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Ekleme İşlemleri</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-base">
                ➕
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">{stats.ekleme} Kayıt</div>
            <div className="text-stone-400 text-[11px] mt-1">Yeni Oluşturulan Veriler</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Güncelleme İşlemleri</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                🔄
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400">{stats.guncelleme} Kayıt</div>
            <div className="text-stone-400 text-[11px] mt-1">Düzenlenen Veriler</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Silme İşlemleri</span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-base">
                🗑️
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-400">{stats.silme} Kayıt</div>
            <div className="text-stone-400 text-[11px] mt-1">Kritik Silme Eylemleri</div>
          </div>
        </div>

        {/* ──────────────── FILTERS CONTAINER ──────────────── */}
        <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="flex-1 relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Açıklama veya kullanıcı ara..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-4 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50"
              />
            </div>

            {/* Action Type Select */}
            <div className="w-full md:w-56">
              <select
                value={actionFilter}
                onChange={e => setActionFilter(e.target.value)}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50"
              >
                <option value="Tümü">Tüm İşlem Tipleri</option>
                <option value="EKLEME">➕ Sadece Ekleme</option>
                <option value="GUNCELLEME">🔄 Sadece Güncelleme</option>
                <option value="SILME">🗑️ Sadece Silme</option>
              </select>
            </div>
          </div>

          {/* Module Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-t border-stone-800/60 pt-3">
            <span className="text-stone-400 text-xs font-semibold mr-1 shrink-0">Modül:</span>
            {modules.map(mod => {
              const isActive = activeFilter === mod
              return (
                <button
                  key={mod}
                  onClick={() => setActiveFilter(mod)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap active:scale-95 ${
                    isActive
                      ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/20'
                      : 'bg-stone-950 text-stone-400 hover:text-stone-200 border border-stone-800'
                  }`}
                >
                  {mod}
                </button>
              )
            })}
          </div>
        </div>

        {/* ──────────────── ACCORDION LOG LIST ──────────────── */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-16 text-center text-stone-400">
              <div className="animate-spin text-amber-500 text-3xl mb-3">🕵️‍♂️</div>
              <p className="text-sm font-medium">Aktivite Kayıtları Yükleniyor...</p>
            </div>
          ) : Object.keys(groupedLogs).length === 0 ? (
            <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-16 text-center text-stone-500">
              <div className="text-5xl mb-3">🔍</div>
              <h3 className="text-lg font-bold text-stone-300 mb-1">Aktivite Bulunamadı</h3>
              <p className="text-xs text-stone-400 max-w-sm mx-auto">
                Arama kriterlerinize uyan herhangi bir işlem kaydı tespit edilemedi.
              </p>
            </div>
          ) : (
            <HistoryAccordion
              groups={Object.entries(groupedLogs).map(([dateKey, groupLogs]) => ({
                id: dateKey,
                title: dateKey,
                subtitle: `${groupLogs.length} aktivite kaydı`,
                icon: (
                  <span className="text-lg">
                    {dateKey === 'Bugün' ? '📅' : dateKey === 'Dün' ? '⏱️' : '🗓️'}
                  </span>
                ),
                items: groupLogs
              }))}
              defaultExpandedIds={['Bugün']}
              renderContent={items => (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                        <th className="px-5 py-3.5">Saat</th>
                        <th className="px-4 py-3.5">Modül</th>
                        <th className="px-4 py-3.5">İşlem Tipi</th>
                        <th className="px-5 py-3.5">Açıklama</th>
                        <th className="px-4 py-3.5">Kullanıcı</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
                      {items.map(log => (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          className="hover:bg-stone-800/40 transition-colors cursor-pointer"
                        >
                          <td className="px-5 py-3.5 text-stone-400 font-mono whitespace-nowrap text-xs">
                            {formatDate(new Date(log.created_at))}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-block whitespace-nowrap bg-stone-950 text-stone-300 px-2.5 py-0.5 rounded-lg text-xs font-semibold border border-stone-800">
                              {log.module}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {log.action_type === 'EKLEME' && (
                              <span className="inline-block whitespace-nowrap text-emerald-400 font-extrabold text-[10px] uppercase tracking-wider bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                                ➕ Ekleme
                              </span>
                            )}
                            {log.action_type === 'SILME' && (
                              <span className="inline-block whitespace-nowrap text-rose-400 font-extrabold text-[10px] uppercase tracking-wider bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                                🗑️ Silme
                              </span>
                            )}
                            {log.action_type === 'GUNCELLEME' && (
                              <span className="inline-block whitespace-nowrap text-amber-400 font-extrabold text-[10px] uppercase tracking-wider bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                                🔄 Güncelleme
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <p className="text-stone-200 font-semibold text-xs sm:text-sm">
                              {log.description}
                            </p>
                            {log.details?.detay && typeof log.details.detay === 'string' && (
                              <p className="text-stone-400 text-[11px] mt-0.5 truncate max-w-md">
                                {log.details.detay.replace(/[()]/g, '')}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-stone-400 font-mono text-xs whitespace-nowrap">
                            {log.user_id || 'Sistem'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            />
          )}
        </div>
      </main>

      {/* ──────────────── DETAY MODALI ──────────────── */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden relative my-auto max-h-[90vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
                  📋
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">İşlem Detayları & Audit Log</h3>
                  <p className="text-stone-400 text-xs">
                    {selectedLog.module} • {selectedLog.action_type}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800/80 border border-stone-700/80 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <p className="text-stone-400 text-[10px] uppercase font-bold mb-0.5">Tarih / Saat</p>
                  <p className="text-white font-mono font-semibold">
                    {formatDate(new Date(selectedLog.created_at))}
                  </p>
                </div>

                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <p className="text-stone-400 text-[10px] uppercase font-bold mb-0.5">Kullanıcı</p>
                  <p className="text-white font-semibold">{selectedLog.user_id || 'Sistem'}</p>
                </div>

                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <p className="text-stone-400 text-[10px] uppercase font-bold mb-0.5">Modül</p>
                  <p className="text-amber-400 font-extrabold">{selectedLog.module}</p>
                </div>

                <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <p className="text-stone-400 text-[10px] uppercase font-bold mb-0.5">İşlem Tipi</p>
                  <p className="text-white font-bold">{selectedLog.action_type}</p>
                </div>

                {selectedLog.details?._meta?.ip && (
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                    <p className="text-stone-400 text-[10px] uppercase font-bold mb-0.5">IP Adresi</p>
                    <p className="text-stone-300 font-mono font-semibold">{selectedLog.details._meta.ip}</p>
                  </div>
                )}

                {selectedLog.details?._meta?.userAgent && (
                  <div className="bg-stone-950 p-3 rounded-xl border border-stone-800">
                    <p className="text-stone-400 text-[10px] uppercase font-bold mb-0.5">Cihaz / Tarayıcı</p>
                    <p
                      className="text-stone-300 font-semibold truncate"
                      title={selectedLog.details._meta.userAgent}
                    >
                      {selectedLog.details._meta.userAgent.split(' ')[0]}...
                    </p>
                  </div>
                )}
              </div>

              {/* General Description Box */}
              <div className="bg-stone-950 p-4 rounded-xl border border-stone-800">
                <p className="text-stone-400 text-[10px] uppercase font-bold mb-1">Genel Açıklama</p>
                <p className="text-stone-200 text-sm font-medium leading-relaxed">
                  {selectedLog.description}
                </p>
              </div>

              {/* Data Diff & Details */}
              {selectedLog.details && (
                <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-3">
                  <p className="text-amber-400 text-xs font-extrabold uppercase tracking-wider">
                    Veri Değişiklikleri & Fark Analizi
                  </p>

                  <div className="max-h-64 overflow-y-auto pr-1 space-y-3">
                    {typeof selectedLog.details === 'string' ? (
                      <p className="text-xs text-stone-300 bg-stone-900 p-3 rounded-xl border border-stone-800">
                        {selectedLog.details}
                      </p>
                    ) : (
                      <>
                        {/* Detay stringi varsa özel renderla */}
                        {selectedLog.details.detay && typeof selectedLog.details.detay === 'string' && (
                          <div className="space-y-3">
                            {selectedLog.details.detay.split('|').map((item: string, itemIdx: number) => {
                              let title = ''
                              let changeText = item.trim()

                              if (changeText.includes('(')) {
                                const parts = changeText.split('(')
                                title = parts[0].trim()
                                changeText = parts[1].replace(')', '').trim()
                              }

                              const formatTitle = (t: string) => {
                                const dict: Record<string, string> = {
                                  business_logo: 'İşletme Logosu',
                                  business_name: 'İşletme Adı'
                                }
                                return dict[t] || t
                              }
                              const formattedTitle = formatTitle(title)
                              const getLabel = (prefix: string) => {
                                if (formattedTitle.toLowerCase().includes('logo')) return `${prefix} Logo`
                                if (
                                  formattedTitle.toLowerCase().includes('belge') ||
                                  formattedTitle.toLowerCase().includes('fiş')
                                )
                                  return `${prefix} Belge`
                                return `${prefix} Değer`
                              }

                              const renderDiffVal = (val: string, colorClass: string) => {
                                if (!val || val === 'undefined')
                                  return <span className="text-stone-600 italic">Boş</span>
                                if (
                                  val.startsWith('http') &&
                                  (val.includes('.png') ||
                                    val.includes('.jpg') ||
                                    val.includes('.jpeg') ||
                                    val.includes('supabase.co'))
                                ) {
                                  return (
                                    <Image
                                      src={val}
                                      alt="preview"
                                      width={200}
                                      height={64}
                                      className="h-16 w-auto rounded-lg object-contain bg-stone-900 p-1 border border-stone-700 shadow-sm"
                                    />
                                  )
                                }
                                return <span className={`${colorClass} break-all text-center`}>{val}</span>
                              }

                              const changes = changeText.split(',')

                              return (
                                <div
                                  key={itemIdx}
                                  className="bg-stone-900/80 p-3 rounded-xl border border-stone-800 w-full overflow-hidden"
                                >
                                  {title && (
                                    <p className="text-amber-400 font-extrabold mb-2.5 text-xs text-center border-b border-stone-800 pb-1.5">
                                      {formattedTitle}
                                    </p>
                                  )}
                                  <ul className="space-y-2 w-full">
                                    {changes.map((ch: string, idx: number) => {
                                      const cleanCh = ch.trim()
                                      if (!cleanCh) return null

                                      if (cleanCh.includes('->')) {
                                        const [labelSide, newValue] = cleanCh.split('->')
                                        return (
                                          <li
                                            key={idx}
                                            className="flex items-center justify-between gap-3 bg-stone-950 p-3 rounded-xl border border-stone-800 text-center"
                                          >
                                            <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                                              <p className="text-[10px] text-stone-500 uppercase tracking-wider mb-1 font-bold">
                                                {getLabel('Eski')}
                                              </p>
                                              {renderDiffVal(labelSide.trim(), 'text-stone-300 text-xs')}
                                            </div>
                                            <div className="flex-shrink-0 flex items-center justify-center bg-stone-800 w-7 h-7 rounded-full border border-stone-700 text-stone-400 text-xs font-bold shadow-inner">
                                              ➔
                                            </div>
                                            <div className="flex-1 min-w-0 flex flex-col items-center justify-center">
                                              <p className="text-[10px] text-amber-400/80 uppercase tracking-wider mb-1 font-bold">
                                                {getLabel('Yeni')}
                                              </p>
                                              {renderDiffVal(newValue.trim(), 'font-bold text-amber-400 text-xs')}
                                            </div>
                                          </li>
                                        )
                                      }

                                      return (
                                        <li key={idx} className="flex items-center gap-2 text-xs text-stone-300">
                                          <span className="text-amber-400 text-xs">❖</span> {cleanCh}
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
                                amount: 'Tutar',
                                note: 'Açıklama / Not',
                                business_logo: 'İşletme Logosu',
                                business_name: 'İşletme Adı',
                                totalItems: 'Toplam Kalem',
                                totalAmount: 'Toplam Tutar',
                                batchId: 'İşlem Grubu (ID)',
                                batch_id: 'İşlem Grubu (ID)',
                                recipeId: 'Kayıt ID',
                                productId: 'Kayıt ID',
                                materialId: 'Kayıt ID',
                                expenseId: 'Kayıt ID',
                                paymentMethod: 'Ödeme Yöntemi',
                                documentUrl: 'Belge/Fiş',
                                transaction: 'İşlem Detayı'
                              }
                              return dict[k] || k
                            }

                            const renderValue = (v: any) => {
                              if (
                                typeof v === 'string' &&
                                v.startsWith('http') &&
                                (v.includes('.png') ||
                                  v.includes('.jpg') ||
                                  v.includes('.jpeg') ||
                                  v.includes('supabase.co'))
                              ) {
                                return (
                                  <div className="mt-1">
                                    <Image
                                      src={v}
                                      alt="preview"
                                      width={200}
                                      height={96}
                                      className="max-h-24 w-auto rounded-lg object-contain border border-stone-700 bg-stone-900 p-1"
                                    />
                                  </div>
                                )
                              }
                              return <span className="text-stone-200 text-xs break-all font-medium">{String(v)}</span>
                            }

                            if (typeof value === 'object' && value !== null) {
                              return (
                                <div
                                  key={key}
                                  className="flex flex-col gap-2 bg-stone-900/80 px-4 py-3 rounded-xl border border-stone-800"
                                >
                                  <span className="text-stone-400 text-[10px] font-bold uppercase">
                                    {formatKey(key)}
                                  </span>
                                  <div className="bg-stone-950 p-2.5 rounded-lg border border-stone-800/80 flex flex-col gap-1.5">
                                    {Object.entries(value).map(([subK, subV]) => (
                                      <div key={subK} className="flex flex-col sm:flex-row sm:items-center gap-2">
                                        <span className="text-stone-400 text-[11px] min-w-[120px]">
                                          {formatKey(subK)}:
                                        </span>
                                        {renderValue(subV)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )
                            }

                            return (
                              <div
                                key={key}
                                className="flex flex-col sm:flex-row sm:items-center justify-start gap-3 bg-stone-900/80 px-4 py-2.5 rounded-xl border border-stone-800 text-xs"
                              >
                                <span className="text-stone-400 text-[10px] font-bold uppercase min-w-[120px]">
                                  {formatKey(key)}
                                </span>
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

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-stone-950 border-t border-stone-800 flex justify-between items-center">
              {getModulePath(selectedLog.module) ? (
                <Link
                  href={getModulePath(selectedLog.module) as string}
                  className="text-amber-400 hover:text-amber-300 text-xs font-bold transition-colors flex items-center gap-1.5 bg-amber-500/10 px-3.5 py-2 rounded-xl border border-amber-500/20 active:scale-95"
                >
                  <span>🔗</span>
                  <span>İlgili Sayfaya Git</span>
                </Link>
              ) : (
                <div />
              )}

              <button
                onClick={() => setSelectedLog(null)}
                className="bg-stone-800 hover:bg-stone-700 text-white px-5 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
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
