import type { Metadata } from 'next'

import { LoginBrandPanel } from '@/features/auth/components/LoginBrandPanel'
import { LoginBrandingProvider } from '@/features/auth/components/LoginBrandingProvider'
import { LoginScreen } from '@/features/auth/components/LoginScreen'

export const metadata: Metadata = {
  title: 'Giriş Yap | Motto SaaS',
  description: 'Motto SaaS restoran yönetim paneline güvenli giriş yapın.',
}

export default function LoginPage() {
  return (
    <main className="relative min-h-[100svh] overflow-x-hidden bg-[#090807] text-stone-100 selection:bg-amber-400/25">
      <LoginBrandingProvider>
        <div className="grid min-h-[100svh] lg:grid-cols-[minmax(0,1.12fr)_minmax(440px,0.88fr)]">
          <LoginBrandPanel />
          <LoginScreen />
        </div>
      </LoginBrandingProvider>
    </main>
  )
}
