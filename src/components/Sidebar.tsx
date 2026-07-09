'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useState, useEffect } from 'react'

export default function Sidebar({ onCloseMobile }: { onCloseMobile?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [userName, setUserName] = useState('Yükleniyor...')
  const [userRole, setUserRole] = useState('Yönetici')
  const [businessName, setBusinessName] = useState('Motto SaaS')
  const [businessLogo, setBusinessLogo] = useState('')
  const [loadingSettings, setLoadingSettings] = useState(true)

  useEffect(() => {
    async function fetchData() {
      // Kullanıcı Bilgisi
      const { data: { user } } = await supabase.auth.getUser()
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
        const bName = settingsData.find(s => s.key === 'business_name')?.value
        const bLogo = settingsData.find(s => s.key === 'business_logo')?.value
        if (bName) setBusinessName(bName)
        if (bLogo) setBusinessLogo(bLogo)
      }
      setLoadingSettings(false)
    }
    fetchData()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menuGroups = [
    {
      title: 'Genel',
      items: [
        { name: 'Ana Ekran', icon: '🏠', path: '/dashboard' },
      ]
    },
    {
      title: 'Katalog & Üretim',
      items: [
        { name: 'Ürünler', icon: '🍔', path: '/dashboard/urunler' },
        { name: 'Hammaddeler', icon: '🧪', path: '/dashboard/hammaddeler' },
        { name: 'Stok Takibi', icon: '📦', path: '/dashboard/stok' },
        { name: 'Üretim Reçeteleri', icon: '🥣', path: '/dashboard/yari-mamuller' },
        { name: 'Tedarikçiler', icon: '🏢', path: '/dashboard/tedarikciler' },
      ]
    },
    {
      title: 'Finans & Kasa',
      items: [
        { name: 'Finans ve Hesaplar', icon: '🏦', path: '/dashboard/finans' },
        { name: 'Kasa Sayımı', icon: '🏧', path: '/dashboard/kasa/sayim' },
        { name: 'Giderler', icon: '💸', path: '/dashboard/giderler' },
        { name: 'Yatırımlar', icon: '📈', path: '/dashboard/yatirimlar' },
        { name: 'Fiyat Motoru', icon: '⚙️', path: '/dashboard/fiyat-motoru' },
      ]
    },
    {
      title: 'Yönetim',
      items: [
        { name: 'Raporlar', icon: '📊', path: '/dashboard/raporlar' },
        { name: 'İşlem Geçmişi', icon: '🕵️‍♂️', path: '/dashboard/islem-gecmisi' },
        { name: 'Ayarlar', icon: '⚙️', path: '/dashboard/ayarlar' },
      ]
    }
  ]

  return (
    <div className="w-64 bg-stone-900 border-r border-stone-800 flex flex-col h-full shadow-2xl md:shadow-none">
      <div className="p-6 border-b border-stone-800 flex items-center justify-between">
        <div className="flex items-center gap-3 w-full">
          {loadingSettings ? (
            <div className="w-10 h-10 rounded-lg bg-stone-800 animate-pulse shrink-0 border border-stone-700/50" />
          ) : businessLogo ? (
            <img src={businessLogo} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white/5 p-1 shrink-0 border border-stone-700/50" />
          ) : (
            <div className="text-3xl">☕</div>
          )}
          <div className="min-w-0 flex-1">
            {loadingSettings ? (
              <div className="space-y-1.5 py-1">
                <div className="h-4 bg-stone-800 rounded w-24 animate-pulse" />
                <div className="h-3 bg-stone-800 rounded w-16 animate-pulse" />
              </div>
            ) : (
              <>
                <h1 className="font-bold text-amber-500 text-lg truncate" title={businessName}>{businessName}</h1>
                <p className="text-stone-500 text-xs">Restoran Zekası</p>
              </>
            )}
          </div>
        </div>
        {onCloseMobile && (
          <button 
            onClick={onCloseMobile}
            className="md:hidden text-stone-400 hover:text-white p-1 rounded-lg hover:bg-stone-800 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      
      <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
        {menuGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
            <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-3 px-4">
              {group.title}
            </div>
            <div className="space-y-1">
              {group.items.map(item => {
                const isActive = pathname === item.path
                return (
                  <Link 
                    key={item.path} 
                    href={item.path}
                    onClick={() => {
                      if (onCloseMobile) onCloseMobile();
                    }}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                      isActive 
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                        : 'text-stone-400 hover:bg-stone-800 hover:text-white border border-transparent'
                    }`}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span className="font-medium">{item.name}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      
      <div className="p-4 border-t border-stone-800 relative mt-auto">
        {showProfileMenu && (
          <div className="absolute bottom-full left-4 right-4 mb-2 bg-stone-800 border border-stone-700 rounded-xl shadow-2xl overflow-hidden z-50">
             <Link 
               href="/dashboard/ayarlar?tab=profil" 
               onClick={() => { setShowProfileMenu(false); if (onCloseMobile) onCloseMobile(); }}
               className="flex items-center gap-3 px-4 py-3 text-sm text-stone-300 hover:bg-stone-700 hover:text-white transition-colors border-b border-stone-700/50"
             >
                <span className="text-lg">👤</span> Profilim
             </Link>
             <Link 
               href="/dashboard/ayarlar?tab=genel" 
               onClick={() => { setShowProfileMenu(false); if (onCloseMobile) onCloseMobile(); }}
               className="flex items-center gap-3 px-4 py-3 text-sm text-stone-300 hover:bg-stone-700 hover:text-white transition-colors border-b border-stone-700/50"
             >
                <span className="text-lg">⚙️</span> Hesap Ayarları
             </Link>
             <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left font-bold">
                <span className="text-lg">🚪</span> Çıkış Yap
             </button>
          </div>
        )}
        <button 
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          className="w-full bg-stone-950 rounded-lg p-3 text-left border border-stone-800 hover:border-amber-500/50 hover:bg-stone-900 transition-colors flex items-center justify-between group"
        >
          <div>
            <p className="text-xs text-stone-500 mb-0.5 group-hover:text-amber-500/70 transition-colors">{userRole}</p>
            <p className="text-sm font-bold text-stone-300 group-hover:text-amber-400 transition-colors truncate max-w-[150px]">{userName}</p>
          </div>
          <span className="text-stone-600 group-hover:text-amber-500 transition-colors text-xs">
             {showProfileMenu ? '▼' : '▲'}
          </span>
        </button>
      </div>
    </div>
  )
}
