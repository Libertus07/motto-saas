'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useState, useEffect, useMemo } from 'react'
import { OrganizationSwitcher } from '@/components/OrganizationSwitcher'
import { replayAppTour } from '@/hooks/useAppTour'

export default function Sidebar({ onCloseMobile }: { onCloseMobile?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [userName, setUserName] = useState('Yükleniyor...')
  const [userRole, setUserRole] = useState('Yönetici')
  const [businessName, setBusinessName] = useState('Motto SaaS')
  const [businessLogo, setBusinessLogo] = useState('')
  const [loadingSettings, setLoadingSettings] = useState(true)

  useEffect(() => {
    async function fetchData() {
      // Kullanıcı Bilgisi
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setUserName(user.email?.split('@')[0] || 'Kullanıcı')
        setUserRole('Yönetici')
      } else {
        setUserName('Test Kullanıcısı')
        setUserRole('Geliştirici Modu')
      }

      // İşletme Ayarları
      const { data: settingsData } = await supabase.from('settings').select('key, value')
      if (settingsData) {
        const bName = settingsData.find((s) => s.key === 'business_name')?.value
        const bLogo = settingsData.find((s) => s.key === 'business_logo')?.value
        if (bName) setBusinessName(bName)
        if (bLogo) setBusinessLogo(bLogo)
      }
      setLoadingSettings(false)
    }
    void fetchData()
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menuGroups = [
    {
      title: 'Genel',
      badgeColor: 'bg-amber-500',
      items: [{ name: 'Ana Ekran', icon: '🏠', path: '/dashboard' }],
    },
    {
      title: 'Katalog & Üretim',
      badgeColor: 'bg-emerald-500',
      items: [
        { name: 'Ürünler', icon: '🍔', path: '/dashboard/urunler' },
        { name: 'Hammaddeler', icon: '🧪', path: '/dashboard/hammaddeler' },
        { name: 'Stok Takibi', icon: '📦', path: '/dashboard/stok' },
        { name: 'Üretim Reçeteleri', icon: '🥣', path: '/dashboard/yari-mamuller' },
        { name: 'Tedarikçiler', icon: '🏢', path: '/dashboard/tedarikciler' },
      ],
    },
    {
      title: 'Finans & Kasa',
      badgeColor: 'bg-blue-500',
      items: [
        { name: 'Finans ve Hesaplar', icon: '🏦', path: '/dashboard/finans' },
        { name: 'Kasa Sayımı', icon: '🏧', path: '/dashboard/kasa/sayim' },
        { name: 'Giderler', icon: '💸', path: '/dashboard/giderler' },
        { name: 'Yatırımlar', icon: '📈', path: '/dashboard/yatirimlar' },
        { name: 'Fiyat Motoru', icon: '⚙️', path: '/dashboard/fiyat-motoru' },
      ],
    },
    {
      title: 'Yönetim',
      badgeColor: 'bg-purple-500',
      items: [
        { name: 'Raporlar', icon: '📊', path: '/dashboard/raporlar' },
        { name: 'İşlem Geçmişi', icon: '🕵️‍♂️', path: '/dashboard/islem-gecmisi' },
        { name: 'Ayarlar', icon: '⚙️', path: '/dashboard/ayarlar' },
      ],
    },
  ]

  const userInitial = userName ? userName[0].toUpperCase() : 'U'

  return (
    <aside className="w-64 bg-stone-900/95 border-r border-stone-800/80 backdrop-blur-2xl flex flex-col h-full shadow-2xl md:shadow-none select-none">
      {/* ──────────────── BRAND HEADER ──────────────── */}
      <div className="p-5 border-b border-stone-800/80 bg-stone-950/60 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {loadingSettings ? (
            <div className="w-10 h-10 rounded-2xl bg-stone-800 animate-pulse shrink-0 border border-stone-700/50" />
          ) : businessLogo ? (
            <div className="w-10 h-10 rounded-2xl bg-stone-950 border border-amber-500/30 p-1 shrink-0 flex items-center justify-center shadow-inner shadow-amber-500/10">
              <Image
                src={businessLogo}
                alt="Logo"
                width={40}
                height={40}
                unoptimized
                className="w-full h-full object-contain"
                onError={() => setBusinessLogo('')}
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0 font-extrabold shadow-inner">
              ☕
            </div>
          )}
          <div className="min-w-0 flex-1">
            {loadingSettings ? (
              <div className="space-y-1.5 py-1">
                <div className="h-4 bg-stone-800 rounded w-24 animate-pulse" />
                <div className="h-3 bg-stone-800 rounded w-16 animate-pulse" />
              </div>
            ) : (
              <>
                <h1
                  className="font-extrabold text-amber-400 text-sm sm:text-base truncate tracking-tight mb-1"
                  title={businessName}
                >
                  {businessName}
                </h1>
                <OrganizationSwitcher />
              </>
            )}
          </div>
        </div>

        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            aria-label="Menüyü kapat"
            className="md:hidden min-h-[44px] min-w-[44px] shrink-0 text-stone-400 hover:text-white p-1.5 rounded-xl hover:bg-stone-800/80 border border-stone-700/50 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ──────────────── NAVIGATION MENU ──────────────── */}
      <nav
        id="tour-sidebar-nav"
        aria-label="Ana Navigasyon"
        className="flex-1 p-3.5 space-y-5 overflow-y-auto scrollbar-none"
      >
        {menuGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-1">
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-stone-500 uppercase tracking-widest px-3 py-1">
              <span className={`w-1.5 h-1.5 rounded-full ${group.badgeColor}`} aria-hidden="true" />
              <span>{group.title}</span>
            </div>

            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.path
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => {
                      if (onCloseMobile) onCloseMobile()
                    }}
                    className={`group relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all active:scale-[0.98] ${
                      isActive
                        ? 'bg-gradient-to-r from-amber-500/20 to-amber-600/5 text-amber-400 border border-amber-500/30 shadow-md shadow-amber-500/10'
                        : 'text-stone-400 hover:bg-stone-800/50 hover:text-stone-100 border border-transparent'
                    }`}
                  >
                    {/* Active Vertical Glow Line */}
                    {isActive && (
                      <span
                        className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500 rounded-r-full shadow-sm shadow-amber-400"
                        aria-hidden="true"
                      />
                    )}

                    <span className="text-lg transition-transform group-hover:scale-110" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ──────────────── USER PROFILE FOOTER ──────────────── */}
      <div className="p-3.5 border-t border-stone-800/80 bg-stone-950/60 relative mt-auto">
        <button
          type="button"
          onClick={() => replayAppTour()}
          className="mb-2.5 min-h-[44px] w-full rounded-xl border border-stone-700/70 bg-stone-900/80 px-3 py-2 text-left text-xs font-bold text-stone-300 transition-colors hover:border-amber-500/40 hover:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        >
          Uygulama turunu yeniden başlat
        </button>
        {showProfileMenu && (
          <div className="absolute bottom-full left-3.5 right-3.5 mb-2 bg-stone-900/95 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden z-50 backdrop-blur-xl animate-fadeIn">
            <Link
              href="/dashboard/ayarlar?tab=profil"
              onClick={() => {
                setShowProfileMenu(false)
                if (onCloseMobile) onCloseMobile()
              }}
              className="flex items-center gap-3 px-4 py-3 text-xs sm:text-sm text-stone-300 hover:bg-stone-800/60 hover:text-amber-400 transition-colors border-b border-stone-800/80 font-bold"
            >
              <span className="text-base" aria-hidden="true">
                👤
              </span>{' '}
              Profilim
            </Link>
            <Link
              href="/dashboard/ayarlar?tab=genel"
              onClick={() => {
                setShowProfileMenu(false)
                if (onCloseMobile) onCloseMobile()
              }}
              className="flex items-center gap-3 px-4 py-3 text-xs sm:text-sm text-stone-300 hover:bg-stone-800/60 hover:text-amber-400 transition-colors border-b border-stone-800/80 font-bold"
            >
              <span className="text-base" aria-hidden="true">
                ⚙️
              </span>{' '}
              Hesap Ayarları
            </Link>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 text-xs sm:text-sm text-rose-400 hover:bg-rose-500/10 transition-colors text-left font-extrabold"
            >
              <span className="text-base" aria-hidden="true">
                🚪
              </span>{' '}
              Çıkış Yap
            </button>
          </div>
        )}

        <button
          id="tour-sidebar-profile"
          aria-label="Profil menüsünü aç"
          aria-expanded={showProfileMenu}
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          className="w-full bg-stone-900/90 rounded-2xl p-2.5 text-left border border-stone-800/80 hover:border-amber-500/40 hover:bg-stone-900 transition-all flex items-center justify-between group active:scale-[0.98] shadow-inner"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-xs flex items-center justify-center shrink-0">
              {userInitial}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-stone-500 group-hover:text-amber-400/80 transition-colors uppercase tracking-wider">
                {userRole}
              </p>
              <p className="text-xs font-black text-stone-200 group-hover:text-amber-400 transition-colors truncate max-w-[130px]">
                {userName}
              </p>
            </div>
          </div>

          <span className="text-stone-500 group-hover:text-amber-400 transition-colors text-xs p-1" aria-hidden="true">
            {showProfileMenu ? '▼' : '▲'}
          </span>
        </button>
      </div>
    </aside>
  )
}
