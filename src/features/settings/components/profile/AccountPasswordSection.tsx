import { Input } from '@/components/ui/input'
import { PASSWORD_STRENGTH } from '../../account-security'
import { useAccountPasswordSecurity } from '../../hooks/useAccountPasswordSecurity'
import { FormRow } from '../ui/FormRow'
import { PasswordInput } from '../ui/PasswordInput'
import { SectionCard } from '../ui/SectionCard'
import { AccountMessage } from './AccountMessage'

export function AccountPasswordSection({ currentEmail }: { currentEmail: string }) {
  const passwordSecurity = useAccountPasswordSecurity(currentEmail)
  const score = passwordSecurity.strength

  return (
    <SectionCard
      title="Güvenlik ve Şifre"
      description="Hesap güvenliğiniz için şifrenizi güçlü tutun ve kimseyle paylaşmayın."
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormRow label="Yeni Şifre">
          <PasswordInput
            value={passwordSecurity.password}
            onChange={passwordSecurity.setPassword}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          {passwordSecurity.password.length > 0 && (
            <div className="mt-2 animate-fadeIn space-y-1">
              <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      score > index ? PASSWORD_STRENGTH.colors[score] : 'bg-stone-800'
                    }`}
                  />
                ))}
              </div>
              <p className={`text-right text-[11px] font-bold ${PASSWORD_STRENGTH.textColors[score]}`}>
                Şifre gücü: {PASSWORD_STRENGTH.labels[score]}
              </p>
            </div>
          )}
        </FormRow>
        <FormRow label="Yeni Şifre (Tekrar)">
          <PasswordInput
            value={passwordSecurity.passwordConfirm}
            onChange={passwordSecurity.setPasswordConfirm}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          {passwordSecurity.passwordConfirm.length > 0 && (
            <div className="mt-2 flex animate-fadeIn items-center gap-1 text-xs font-semibold">
              {passwordSecurity.password === passwordSecurity.passwordConfirm ? (
                <span className="flex items-center gap-1 font-bold text-emerald-400">✓ Şifreler eşleşiyor</span>
              ) : (
                <span className="flex items-center gap-1 font-bold text-rose-400">✕ Şifreler eşleşmiyor</span>
              )}
            </div>
          )}
        </FormRow>

        <div className="mt-2 md:col-span-2">
          {!passwordSecurity.showOtpInput && (
            <button
              type="button"
              onClick={() => void passwordSecurity.requestChange()}
              disabled={
                passwordSecurity.saving ||
                !passwordSecurity.password ||
                !passwordSecurity.passwordConfirm ||
                !currentEmail
              }
              className="w-full rounded-xl border border-stone-700 bg-stone-800 px-6 py-2.5 text-xs font-extrabold text-white transition-all hover:bg-stone-700 active:scale-95 disabled:opacity-50"
            >
              {passwordSecurity.saving ? 'İşleniyor...' : 'Şifreyi Güncellemek İçin Doğrulama Kodu Gönder'}
            </button>
          )}
          {!passwordSecurity.showOtpInput && <AccountMessage message={passwordSecurity.message} />}
        </div>

        {passwordSecurity.showOtpInput && (
          <>
            <div className="mt-1 border-t border-stone-800/80 pt-2 md:col-span-2" />
            <FormRow label="Şifre Değiştirme Onay Kodu" hint="E-posta adresinize gönderilen 6 haneli kod">
              <Input
                value={passwordSecurity.otp}
                onChange={(event) => passwordSecurity.setOtp(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
              />
            </FormRow>
            <div className="mt-2 md:col-span-2">
              <button
                type="button"
                onClick={() => void passwordSecurity.verifyChange()}
                disabled={passwordSecurity.saving || !passwordSecurity.otp}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 text-xs font-extrabold text-stone-950 shadow-lg shadow-amber-500/20 transition-all hover:from-amber-400 hover:to-amber-500 active:scale-95 disabled:opacity-50"
              >
                {passwordSecurity.saving ? 'Doğrulanıyor...' : 'Kodu Doğrula ve Şifreyi Güncelle'}
              </button>
              <AccountMessage message={passwordSecurity.message} />
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
