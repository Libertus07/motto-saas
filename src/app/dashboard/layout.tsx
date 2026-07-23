'use client'

import { useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { useAppTour } from '@/hooks/useAppTour'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // GLOBAL TOUR
  useAppTour('global_dashboard', [
    {
      element: 'body',
      popover: {
        title: 'Motto SaaS\'a Hoş Geldiniz! 🎉',
        description: 'Size işletmenizi daha karlı yöneteceğiniz akıllı asistanınızı hızlıca tanıtalım.',
        side: 'top',
        align: 'center'
      }
    },
    {
      element: '#tour-sidebar-nav',
      popover: {
        title: 'Modül Menüsü 🧭',
        description: 'Uygulamanın tüm güçlerine buradan erişebilirsiniz. Hammaddeler, Üretim Reçeteleri ve Fiyat Motoru birbiriyle entegre çalışır.',
        side: 'right',
        align: 'start'
      }
    },
    {
      element: '#tour-sidebar-profile',
      popover: {
        title: 'Hesap & Ayarlar 👤',
        description: 'Tıklayarak şirket ayarlarınızı güncelleyebilir veya güvenle çıkış yapabilirsiniz.',
        side: 'right',
        align: 'end'
      }
    }
  ], 1000); // Sayfa yüklenmesinden 1 sn sonra başlasın

  return (
    <div className="flex h-screen bg-stone-950 overflow-hidden">
      
      {/* Sidebar Mobile Overlay Background */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (Desktop fixed/flex, Mobile fixed & translated) */}
      <div className={`
        fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onCloseMobile={() => setIsMobileMenuOpen(false)} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Mobile Header with Hamburger Menu */}
        <div className="md:hidden flex items-center justify-between bg-stone-900 px-4 py-3 border-b border-stone-800 shrink-0 shadow-sm relative z-30">
          <div className="flex items-center gap-2">
            <span className="text-xl">☕</span>
            <span className="font-bold text-amber-500">Motto SaaS</span>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 text-stone-400 hover:text-white rounded-lg hover:bg-stone-800 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            aria-label="Menüyü Aç"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
