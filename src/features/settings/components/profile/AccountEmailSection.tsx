import { useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { useAccountEmailSecurity } from '../../hooks/useAccountEmailSecurity'
import { FormRow } from '../ui/FormRow'
import { SectionCard } from '../ui/SectionCard'
import { AccountMessage } from './AccountMessage'

export function AccountEmailSection({ onEmailLoaded }: { onEmailLoaded?: (email: string) => void }) {
  const emailSecurity = useAccountEmailSecurity()
  const { currentEmail } = emailSecurity

  useEffect(() => {
    if (currentEmail) onEmailLoaded?.(currentEmail)
  }, [currentEmail, onEmailLoaded])

  return (
    <SectionCard title="E-Posta Adresi" description="Sisteme giriş yaparken kullandığınız e-posta adresi.">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormRow label="Mevcut E-posta Adresi">
          <div className="flex h-[38px] cursor-not-allowed items-center rounded-xl border border-stone-800 bg-stone-950 px-3 py-2 font-mono text-xs font-medium text-stone-400">
            {currentEmail || 'Yükleniyor...'}
          </div>
        </FormRow>
        <FormRow label="Yeni E-posta Adresi">
          <Input
            value={emailSecurity.email}
            onChange={(event) => emailSecurity.setEmail(event.target.value)}
            type="email"
            autoComplete="email"
          />
        </FormRow>

        <div className="mt-2 md:col-span-2">
          {!emailSecurity.showOtpInput && (
            <button
              type="button"
              onClick={() => void emailSecurity.requestChange()}
              disabled={
                emailSecurity.saving || emailSecurity.email.trim() === currentEmail || !emailSecurity.email.trim()
              }
              className="w-full rounded-xl border border-stone-700 bg-stone-800 px-6 py-2.5 text-xs font-extrabold text-white transition-all hover:bg-stone-700 active:scale-95 disabled:opacity-50"
            >
              {emailSecurity.saving ? 'Gönderiliyor...' : 'Doğrulama Kodlarını Gönder'}
            </button>
          )}
          {!emailSecurity.showOtpInput && <AccountMessage message={emailSecurity.message} />}
        </div>

        {emailSecurity.showOtpInput && (
          <>
            <div className="mt-1 border-t border-stone-800/80 pt-2 md:col-span-2" />
            <FormRow label="Eski E-posta Onay Kodu" hint="Mevcut adresinize gönderilen kod">
              <Input
                value={emailSecurity.oldEmailOtp}
                onChange={(event) => emailSecurity.setOldEmailOtp(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </FormRow>
            <FormRow label="Yeni E-posta Onay Kodu" hint="Yeni adresinize gönderilen kod">
              <Input
                value={emailSecurity.newEmailOtp}
                onChange={(event) => emailSecurity.setNewEmailOtp(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </FormRow>
            <div className="mt-2 md:col-span-2">
              <button
                type="button"
                onClick={() => void emailSecurity.verifyChange()}
                disabled={emailSecurity.saving || !emailSecurity.oldEmailOtp || !emailSecurity.newEmailOtp}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-xs font-extrabold text-stone-950 shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-amber-500 active:scale-95 disabled:opacity-50"
              >
                {emailSecurity.saving ? 'Doğrulanıyor...' : 'Kodları Doğrula ve Güncelle'}
              </button>
              <AccountMessage message={emailSecurity.message} />
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
