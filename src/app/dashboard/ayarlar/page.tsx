'use client'

import { useState, useEffect } from 'react'
import { useSettings } from '@/features/settings/hooks/useSettings'
import { Tab } from '@/features/settings/types'
import { GenelTab } from '@/features/settings/components/tabs/GenelTab'
import { ProfilTab } from '@/features/settings/components/tabs/ProfilTab'
import { FinansalTab } from '@/features/settings/components/tabs/FinansalTab'
import { BildirimlerTab } from '@/features/settings/components/tabs/BildirimlerTab'
import { EkipTab } from '@/features/settings/components/tabs/EkipTab'
import { EntegrasyonlarTab } from '@/features/settings/components/tabs/EntegrasyonlarTab'

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-800 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 z-50 animate-fadeIn backdrop-blur-md">
      <span className="text-emerald-400 text-lg">✓</span>
      <span className="text-xs font-bold">{message}</span>
    </div>
  )
}

export default function Ayarlar() {
  const [activeTab, setActiveTab] = useState<Tab>('genel')
  
  const {
    loading,
    saving,
    settings,
    categories,
    toast,
    setToast,
    setCategories,
    setSetting,
    handleSave,
    activeNotificationCount
  } = useSettings()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab') as Tab
      if (tab && ['genel', 'profil', 'finansal', 'bildirimler', 'ekip', 'entegrasyonlar'].includes(tab)) {
        const timer = setTimeout(() => setActiveTab(tab), 0)
        return () => clearTimeout(timer)
      }
    }
  }, [setActiveTab])

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'genel', label: 'Genel', icon: '🏪' },
    { id: 'profil', label: 'Profilim', icon: '👤' },
    { id: 'finansal', label: 'Finansal', icon: '💰' },
    { id: 'bildirimler', label: 'Bildirimler', icon: '🔔' },
    { id: 'ekip', label: 'Ekip', icon: '👥' },
    { id: 'entegrasyonlar', label: 'Entegrasyonlar', icon: '🔗' }
  ]

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      {/* ──────────────── HEADER BAR ──────────────── */}
      <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
              ⚙️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">Ayarlar</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                  Sistem & Hesap Yapılandırması
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                İşletme profili, hesap güvenliği, finansal parametreler ve bildirim tercihleri.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ──────────────── MAIN CONTAINER ──────────────── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* EXECUTIVE SYSTEM STATUS CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">İşletme Adı</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                🏪
              </span>
            </div>
            <div className="text-lg sm:text-xl font-black text-white truncate">
              {settings.business_name || 'Motto Café'}
            </div>
            <div className="text-stone-400 text-[11px] mt-1">Aktif İşletme Profili</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Hedef Kar Marjı</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                💰
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400">%{settings.target_margin}</div>
            <div className="text-stone-400 text-[11px] mt-1">Motor Hesaplama Hedefi</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Aktif Kategoriler</span>
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-base">
                📦
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-emerald-400">{categories.length} Kategori</div>
            <div className="text-stone-400 text-[11px] mt-1">Hammadde Grupları</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Aktif Bildirimler</span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-base">
                🔔
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-400">
              {activeNotificationCount} / 4 Açık
            </div>
            <div className="text-stone-400 text-[11px] mt-1">Uyarı & Ciro Takibi</div>
          </div>
        </div>

        {/* ──────────────── TAB NAVIGATION BAR ──────────────── */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 bg-stone-900/60 p-2 rounded-2xl border border-stone-800/80 backdrop-blur-md scrollbar-none">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 shadow-lg shadow-amber-500/20'
                    : 'bg-stone-950/60 text-stone-400 hover:text-white hover:bg-stone-800/60 border border-stone-800/60'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* ──────────────── TAB CONTENT ──────────────── */}
        {loading ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400 backdrop-blur-md">
            <div className="animate-spin text-amber-500 text-3xl mb-3">⚙️</div>
            <p className="text-sm font-medium">Ayarlar Yükleniyor...</p>
          </div>
        ) : (
          <>
            {activeTab === 'genel' && (
              <GenelTab s={settings} set={setSetting} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'profil' && <ProfilTab />}
            {activeTab === 'finansal' && (
              <FinansalTab
                s={settings}
                set={setSetting}
                onSave={handleSave}
                saving={saving}
                categories={categories}
                setCategories={setCategories}
              />
            )}
            {activeTab === 'bildirimler' && (
              <BildirimlerTab s={settings} set={setSetting} onSave={handleSave} saving={saving} />
            )}
            {activeTab === 'ekip' && <EkipTab />}
            {activeTab === 'entegrasyonlar' && <EntegrasyonlarTab />}
          </>
        )}
      </main>

      {/* Toast Alert */}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}
