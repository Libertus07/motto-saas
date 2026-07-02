'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <div className="min-h-screen bg-stone-950 flex items-center justify-center" suppressHydrationWarning>
      <div className="bg-stone-900 p-8 rounded-2xl w-full max-w-md border border-stone-800" suppressHydrationWarning>
        
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">☕</div>
          <h1 className="text-2xl font-bold text-amber-400">Motto Coffee</h1>
          <p className="text-stone-400 text-sm mt-1">Yönetim Paneli</p>
        </div>

        {/* Form */}
        <div className="space-y-4" suppressHydrationWarning>
          <div suppressHydrationWarning>
            <label className="text-stone-300 text-sm mb-1 block">E-posta</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-400"
              placeholder="ornek@email.com"
              suppressHydrationWarning
              data-1p-ignore
            />
          </div>

          <div suppressHydrationWarning>
            <label className="text-stone-300 text-sm mb-1 block">Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full bg-stone-800 border border-stone-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-400"
              placeholder="••••••••"
              suppressHydrationWarning
              data-1p-ignore
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
          
        </div>
      </div>
    </div>
  )
}
