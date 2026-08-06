'use client'

import type { FormEvent } from 'react'
import { useEffect, useRef } from 'react'
import { ArrowRight, CircleAlert, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail } from 'lucide-react'

type LoginFormProps = {
  email: string
  error: string
  loading: boolean
  password: string
  showPassword: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onTogglePassword: () => void
}

export function LoginForm({
  email,
  error,
  loading,
  password,
  showPassword,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onTogglePassword,
}: LoginFormProps) {
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  return (
    <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-semibold text-stone-200">
          E-posta adresi
        </label>
        <div className="group relative">
          <Mail
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-stone-500 transition-colors group-focus-within:text-amber-400"
            aria-hidden="true"
          />
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            disabled={loading}
            required
            aria-invalid={Boolean(error)}
            className="min-h-14 w-full rounded-2xl border border-white/10 bg-black/25 py-3 pr-4 pl-12 text-base text-white outline-none transition-all placeholder:text-stone-600 hover:border-white/15 focus:border-amber-400/60 focus:ring-4 focus:ring-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="ornek@isletmeniz.com"
            data-1p-ignore
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="block text-sm font-semibold text-stone-200">
          Şifre
        </label>
        <div className="group relative">
          <LockKeyhole
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-stone-500 transition-colors group-focus-within:text-amber-400"
            aria-hidden="true"
          />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            disabled={loading}
            required
            aria-invalid={Boolean(error)}
            className="min-h-14 w-full rounded-2xl border border-white/10 bg-black/25 py-3 pr-14 pl-12 text-base text-white outline-none transition-all placeholder:text-stone-600 hover:border-white/15 focus:border-amber-400/60 focus:ring-4 focus:ring-amber-400/10 disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Şifrenizi girin"
            data-1p-ignore
          />
          <button
            type="button"
            onClick={onTogglePassword}
            disabled={loading}
            className="absolute top-1/2 right-1.5 flex size-[44px] -translate-y-1/2 items-center justify-center rounded-xl text-stone-500 outline-none transition-colors hover:bg-white/5 hover:text-stone-200 focus-visible:ring-2 focus-visible:ring-amber-400 disabled:pointer-events-none"
            aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
            aria-pressed={showPassword}
          >
            {showPassword ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {error && (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-2xl border border-red-400/20 bg-red-400/8 px-4 py-3.5 text-red-200 outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
        >
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-400" aria-hidden="true" />
          <p className="text-sm leading-5 font-medium">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="group flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 px-5 text-base font-black text-stone-950 shadow-[0_16px_40px_rgba(245,158,11,0.18)] outline-none transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_48px_rgba(245,158,11,0.28)] focus-visible:ring-4 focus-visible:ring-amber-300/30 active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-60"
      >
        {loading ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            Giriş yapılıyor…
          </>
        ) : (
          <>
            Yönetim paneline giriş yap
            <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  )
}
