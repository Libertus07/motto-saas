'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async () => {
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })

    if (error) {
      setError('E-posta veya şifre hatalı')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex w-full bg-stone-950 text-stone-200 selection:bg-amber-500/30 font-sans" suppressHydrationWarning>
      
      {/* Sol Taraf - Branding (Sadece Desktop) */}
      <div className="hidden lg:flex w-1/2 relative bg-stone-900 items-center justify-center overflow-hidden border-r border-stone-800/50">
        {/* Ambient Işıklar */}
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-amber-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[60vw] h-[60vw] bg-amber-900/10 rounded-full blur-[120px] pointer-events-none" />
        
        {/* Cam Efektli (Glassmorphism) Dekoratif Kartlar */}
        <div className="absolute top-20 left-20 w-64 h-32 bg-stone-800/30 backdrop-blur-3xl border border-stone-700/30 rounded-2xl rotate-[-6deg] opacity-50 pointer-events-none" />
        <div className="absolute bottom-32 right-20 w-48 h-48 bg-stone-800/20 backdrop-blur-3xl border border-stone-700/30 rounded-full opacity-60 pointer-events-none" />

        <div className="relative z-10 p-12 max-w-lg text-center flex flex-col items-center">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-[2rem] bg-gradient-to-tr from-amber-500/20 to-amber-500/5 border border-amber-500/20 mb-8 shadow-[0_0_40px_rgba(245,158,11,0.1)] backdrop-blur-xl">
            <span className="text-6xl">☕</span>
          </div>
          <h1 className="text-5xl font-extrabold text-white tracking-tight mb-6">Motto Coffee</h1>
          <p className="text-stone-400 text-lg leading-relaxed mb-10">
            Yeni nesil akıllı restoran yönetimi. Stoklarınızı, tedarikçilerinizi ve finansal verilerinizi tek bir ekrandan, 
            <span className="text-amber-500 font-semibold"> yapay zeka gücüyle </span> yönetin.
          </p>
          
          {/* Ufak Detay: Sürüm veya Status */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-stone-950/50 border border-stone-800/60 backdrop-blur-md shadow-inner">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" />
            <span className="text-xs font-bold text-stone-300 tracking-wider uppercase">Sistem Aktif & Güvende</span>
          </div>
        </div>
      </div>

      {/* Sağ Taraf - Form (Mobil ve Desktop) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden bg-stone-950">
        
        {/* Mobilde arkada hafif bir ışık kalsın */}
        <div className="lg:hidden absolute top-[10%] right-[-10%] w-[80vw] h-[80vw] bg-amber-600/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-sm space-y-8 relative z-10">
          
          {/* Mobilde Logo */}
          <div className="text-center lg:hidden mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-[1.5rem] bg-gradient-to-tr from-amber-500/20 to-amber-500/5 border border-amber-500/20 mb-5 shadow-inner backdrop-blur-xl">
              <span className="text-4xl">☕</span>
            </div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Motto Coffee</h2>
          </div>

          <div className="space-y-2 text-center lg:text-left mb-10">
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Hoş Geldiniz</h2>
            <p className="text-stone-400 text-sm font-medium">Yönetim paneline erişmek için giriş yapın.</p>
          </div>

          <div className="space-y-6" suppressHydrationWarning>
            {/* E-Posta */}
            <div className="space-y-2" suppressHydrationWarning>
              <label className="text-stone-400 text-xs font-bold uppercase tracking-wider ml-1">E-Posta Adresi</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-stone-500 group-focus-within:text-amber-500 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-stone-900/40 border border-stone-800 rounded-xl pl-11 pr-4 py-3.5 text-white placeholder-stone-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 focus:bg-stone-900/80 transition-all shadow-inner"
                  placeholder="ornek@email.com"
                  suppressHydrationWarning
                  data-1p-ignore
                />
              </div>
            </div>

            {/* Şifre */}
            <div className="space-y-2" suppressHydrationWarning>
              <div className="flex items-center justify-between ml-1">
                <label className="text-stone-400 text-xs font-bold uppercase tracking-wider">Şifre</label>
                {/* İleride şifremi unuttum eklenebilir */}
                {/* <a href="#" className="text-amber-500 hover:text-amber-400 text-xs font-semibold transition-colors">Şifremi Unuttum?</a> */}
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-stone-500 group-focus-within:text-amber-500 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-stone-900/40 border border-stone-800 rounded-xl pl-11 pr-12 py-3.5 text-white placeholder-stone-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 focus:bg-stone-900/80 transition-all shadow-inner"
                  placeholder="••••••••"
                  suppressHydrationWarning
                  data-1p-ignore
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-stone-500 hover:text-stone-300 transition-colors focus:outline-none"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20 animate-fade-in shadow-inner">
                <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm font-semibold">{error}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="group w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-lg py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] disabled:opacity-50 disabled:shadow-none mt-8"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-stone-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>Giriş Yapılıyor...</span>
                </>
              ) : (
                <>
                  <span>Sisteme Giriş Yap</span>
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </>
              )}
            </button>
            
          </div>
        </div>
      </div>
    </div>
  )
}
