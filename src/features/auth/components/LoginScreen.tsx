'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'

import { createClient } from '@/lib/supabase'

import { LoginForm } from './LoginForm'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [supabase] = useState(createClient)
  const router = useRouter()

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    const normalizedEmail = email.trim()
    if (!normalizedEmail || !password) {
      setError('Lütfen e-posta adresinizi ve şifrenizi girin.')
      return
    }

    setLoading(true)
    setError('')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (signInError) {
      setError('E-posta adresi veya şifre hatalı. Bilgilerinizi kontrol edip tekrar deneyin.')
      setLoading(false)
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <section className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-[max(1.5rem,env(safe-area-inset-top))] sm:px-8 lg:px-10 xl:px-16">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-48 right-[-11rem] size-[28rem] rounded-full bg-amber-500/10 blur-[110px]" />
        <div className="absolute -bottom-48 left-[-12rem] size-[30rem] rounded-full bg-orange-700/8 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-[480px]">
        <div className="mb-7 flex items-center justify-center gap-3 lg:hidden">
          <div className="overflow-hidden rounded-2xl border border-amber-200/15 bg-[#efe2cf] shadow-xl">
            <Image src="/icons/logo.png" alt="Motto" width={64} height={64} unoptimized className="size-16" />
          </div>
          <div>
            <p className="text-lg font-black tracking-tight text-white">Motto SaaS</p>
            <p className="text-[0.7rem] font-bold tracking-[0.14em] text-amber-400/80 uppercase">Restoran zekâsı</p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-stone-900/65 p-5 shadow-[0_32px_90px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8 lg:p-9">
          <div className="flex items-start justify-between gap-5">
            <div>
              <p className="mb-2 text-xs font-bold tracking-[0.16em] text-amber-400 uppercase">Güvenli giriş</p>
              <h1 className="text-3xl leading-tight font-black tracking-[-0.035em] text-white sm:text-4xl">
                Tekrar hoş geldiniz
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-stone-400">
                İşletmenizin yönetim alanına devam etmek için hesabınızla giriş yapın.
              </p>
            </div>
            <div className="hidden size-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/8 text-emerald-400 sm:flex">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </div>
          </div>

          <LoginForm
            email={email}
            password={password}
            showPassword={showPassword}
            loading={loading}
            error={error}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onTogglePassword={() => setShowPassword((visible) => !visible)}
            onSubmit={handleLogin}
          />

          <div className="mt-6 border-t border-white/8 pt-5 text-center">
            <p className="text-xs leading-5 text-stone-500">
              Erişim sorunu yaşıyorsanız işletme yöneticinizle iletişime geçin.
            </p>
          </div>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-stone-600">
          <ShieldCheck className="size-4 text-emerald-500/70" aria-hidden="true" />
          Oturum bilgileriniz güvenli bağlantı üzerinden işlenir.
        </p>
      </div>
    </section>
  )
}
