'use client'

import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white">
      
      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">☕</span>
          <div>
            <h1 className="font-bold text-amber-400">Motto Coffee</h1>
            <p className="text-xs text-stone-400">Yönetim Paneli</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-stone-400 hover:text-white text-sm transition-colors"
        >
          Çıkış Yap
        </button>
      </header>

      {/* Ana İçerik */}
      <main className="p-6">
        <h2 className="text-xl font-bold mb-6">Hoş geldiniz 👋</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div
            onClick={() => router.push('/dashboard/hammaddeler')}
            className="bg-stone-900 border border-stone-800 rounded-xl p-6 hover:border-amber-400 transition-colors cursor-pointer"
          >
            <div className="text-3xl mb-3">🧪</div>
            <h3 className="font-bold text-lg">Hammaddeler</h3>
            <p className="text-stone-400 text-sm mt-1">Malzeme listesi ve fiyatlar</p>
          </div>

          <div
            onClick={() => router.push('/dashboard/urunler')}
            className="bg-stone-900 border border-stone-800 rounded-xl p-6 hover:border-amber-400 transition-colors cursor-pointer"
          >
            <div className="text-3xl mb-3">📋</div>
            <h3 className="font-bold text-lg">Ürünler & Reçeteler</h3>
            <p className="text-stone-400 text-sm mt-1">Menü ve maliyet hesabı</p>
          </div>

          <div
            onClick={() => router.push('/dashboard/giderler')}
            className="bg-stone-900 border border-stone-800 rounded-xl p-6 hover:border-amber-400 transition-colors cursor-pointer"
          >
            <div className="text-3xl mb-3">💰</div>
            <h3 className="font-bold text-lg">Giderler</h3>
            <p className="text-stone-400 text-sm mt-1">Kira, personel, faturalar</p>
          </div>

          <div
            onClick={() => router.push('/dashboard/stok')}
            className="bg-stone-900 border border-stone-800 rounded-xl p-6 hover:border-amber-400 transition-colors cursor-pointer"
          >
            <div className="text-3xl mb-3">📦</div>
            <h3 className="font-bold text-lg">Stok Takibi</h3>
            <p className="text-stone-400 text-sm mt-1">Giriş, çıkış, sayım</p>
          </div>

          <div
            onClick={() => router.push('/dashboard/fiyat-motoru')}
            className="bg-stone-900 border border-stone-800 rounded-xl p-6 hover:border-amber-400 transition-colors cursor-pointer"
          >
            <div className="text-3xl mb-3">🧠</div>
            <h3 className="font-bold text-lg">Fiyat Motoru</h3>
            <p className="text-stone-400 text-sm mt-1">Olması gereken fiyat hesabı</p>
          </div>

          <div
            onClick={() => router.push('/dashboard/raporlar')}
            className="bg-stone-900 border border-stone-800 rounded-xl p-6 hover:border-amber-400 transition-colors cursor-pointer"
          >
            <div className="text-3xl mb-3">📊</div>
            <h3 className="font-bold text-lg">Raporlar</h3>
            <p className="text-stone-400 text-sm mt-1">Karlılık ve analizler</p>
          </div>

        </div>
      </main>
    </div>
  )
}
