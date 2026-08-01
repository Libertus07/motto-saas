import { DashboardClient } from '@/components/dashboard/DashboardClient'

export const metadata = {
  title: 'Ana Ekran | Motto SaaS Restoran Zekası',
  description: 'İşletmenizin finansal ve operasyonel durumu tek ekranda.',
}

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-stone-950 text-white p-4 md:p-8 overflow-y-auto">
      {/* 🌟 Header Section (Server Rendered Shell for Instant Paint) */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-black text-amber-400 tracking-tight flex items-center gap-3">
            <span className="text-4xl" aria-hidden="true">
              👋
            </span>{' '}
            Hoş Geldiniz, CEO
          </h1>
          <p className="text-stone-400 mt-1">İşletmenizin finansal ve operasyonel durumu parmaklarınızın ucunda.</p>
        </div>
      </header>

      {/* ⚡ Client Hydrated Interactive Metrics & Navigation */}
      <DashboardClient />
    </div>
  )
}
