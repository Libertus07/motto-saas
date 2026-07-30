import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { Input } from '@/components/ui/input'
import { SectionCard } from '../ui/SectionCard'
import { FormRow } from '../ui/FormRow'
import { PasswordInput } from '../ui/PasswordInput'

export function ProfilTab() {
  const [currentEmail, setCurrentEmail] = useState('')
  const [email, setEmail] = useState('')
  const [oldEmailOtp, setOldEmailOtp] = useState('')
  const [newEmailOtp, setNewEmailOtp] = useState('')
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [pwdOtp, setPwdOtp] = useState('')
  const [showPwdOtpInput, setShowPwdOtpInput] = useState(false)

  const [emailSaving, setEmailSaving] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)

  const [emailMsg, setEmailMsg] = useState({ text: '', type: '' })
  const [pwdMsg, setPwdMsg] = useState({ text: '', type: '' })

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentEmail(user.email || '')
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUpdateEmail = async () => {
    if (email === currentEmail) return
    setEmailSaving(true)
    setEmailMsg({ text: '', type: '' })

    const { error } = await supabase.auth.updateUser({ email })
    if (error) {
      setEmailMsg({ text: 'Hata: ' + error.message, type: 'error' })
    } else {
      setEmailMsg({
        text: 'Mevcut ve yeni e-posta adreslerinize birer doğrulama kodu gönderildi.',
        type: 'success'
      })
      setShowOtpInput(true)
    }
    setEmailSaving(false)
  }

  const handleVerifyEmailOtp = async () => {
    if (!oldEmailOtp || !newEmailOtp) {
      setEmailMsg({ text: 'Lütfen her iki kodu da giriniz.', type: 'error' })
      return
    }

    setEmailSaving(true)
    setEmailMsg({ text: '', type: '' })

    const { error: errOld } = await supabase.auth.verifyOtp({
      email: currentEmail,
      token: oldEmailOtp,
      type: 'email_change'
    })

    if (errOld) {
      setEmailMsg({ text: 'Mevcut e-postanıza gönderilen kod hatalı veya süresi dolmuş.', type: 'error' })
      setEmailSaving(false)
      return
    }

    const { error: errNew } = await supabase.auth.verifyOtp({
      email,
      token: newEmailOtp,
      type: 'email_change'
    })

    if (errNew) {
      setEmailMsg({ text: 'Yeni e-postanıza gönderilen kod hatalı veya süresi dolmuş.', type: 'error' })
      setEmailSaving(false)
      return
    }

    setEmailMsg({ text: 'E-posta adresiniz başarıyla güncellendi.', type: 'success' })
    setCurrentEmail(email)
    setShowOtpInput(false)
    setOldEmailOtp('')
    setNewEmailOtp('')
    await logActivity('Ayarlar', 'GUNCELLEME', 'Kullanıcı e-posta adresi güncellendi.', {
      detay: `Yeni Email: ${email}`
    })
    setEmailSaving(false)
  }

  const calculatePasswordStrength = (pwd: string) => {
    if (!pwd) return 0
    let score = 0
    if (pwd.length >= 6) score += 1
    if (pwd.length >= 10) score += 1
    if (/[A-Z]/.test(pwd)) score += 1
    if (/[0-9]/.test(pwd)) score += 1
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1
    return Math.min(score, 4)
  }

  const pwdScore = calculatePasswordStrength(password)
  const strengthColors = ['bg-rose-500', 'bg-orange-500', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500']
  const strengthTextColors = [
    'text-rose-400',
    'text-orange-400',
    'text-amber-400',
    'text-emerald-400',
    'text-emerald-400'
  ]
  const strengthLabels = ['Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü']

  const handleRequestPasswordOtp = async () => {
    if (!password || password.length < 6) {
      setPwdMsg({ text: 'Yeni şifre en az 6 karakter olmalıdır.', type: 'error' })
      return
    }
    if (password !== passwordConfirm) {
      setPwdMsg({ text: 'Yeni şifreler eşleşmiyor.', type: 'error' })
      return
    }

    setPwdSaving(true)
    setPwdMsg({ text: '', type: '' })

    const { error } = await supabase.auth.resetPasswordForEmail(currentEmail)
    if (error) {
      setPwdMsg({ text: 'Hata: ' + error.message, type: 'error' })
    } else {
      setPwdMsg({ text: 'E-posta adresinize şifre doğrulama kodu gönderildi.', type: 'success' })
      setShowPwdOtpInput(true)
    }
    setPwdSaving(false)
  }

  const handleVerifyPasswordOtp = async () => {
    if (!pwdOtp) return
    setPwdSaving(true)
    setPwdMsg({ text: '', type: '' })

    const { error: otpError } = await supabase.auth.verifyOtp({
      email: currentEmail,
      token: pwdOtp,
      type: 'recovery'
    })

    if (otpError) {
      setPwdMsg({ text: 'Kod hatalı veya süresi dolmuş.', type: 'error' })
      setPwdSaving(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setPwdMsg({ text: 'Şifre güncellenirken hata oluştu: ' + updateError.message, type: 'error' })
    } else {
      setPwdMsg({ text: 'Şifreniz başarıyla güncellendi.', type: 'success' })
      setPassword('')
      setPasswordConfirm('')
      setPwdOtp('')
      setShowPwdOtpInput(false)
      await logActivity('Ayarlar', 'GUNCELLEME', 'Kullanıcı şifresi doğrulama kodu ile güncellendi.', {
        detay: 'Şifre değiştirildi.'
      })
    }
    setPwdSaving(false)
  }

  return (
    <div className="space-y-6">
      <SectionCard title="E-Posta Adresi" description="Sisteme giriş yaparken kullandığınız e-posta adresi.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="Mevcut E-posta Adresi">
            <div className="bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-400 text-xs font-mono font-medium flex items-center h-[38px] cursor-not-allowed">
              {currentEmail || 'Yükleniyor...'}
            </div>
          </FormRow>
          <FormRow label="Yeni E-posta Adresi">
            <Input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="off" />
          </FormRow>

          <div className="md:col-span-2 mt-2">
            {!showOtpInput ? (
              <button
                onClick={handleUpdateEmail}
                disabled={emailSaving || email === currentEmail || !email}
                className="w-full bg-stone-800 hover:bg-stone-700 disabled:opacity-50 border border-stone-700 text-white font-extrabold px-6 py-2.5 rounded-xl transition-all text-xs active:scale-95"
              >
                {emailSaving ? 'Gönderiliyor...' : 'Doğrulama Kodlarını Gönder'}
              </button>
            ) : null}
            {emailMsg.text && !showOtpInput && (
              <p
                className={`text-xs font-bold mt-2 text-center ${
                  emailMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {emailMsg.text}
              </p>
            )}
          </div>

          {showOtpInput && (
            <>
              <div className="md:col-span-2 border-t border-stone-800/80 pt-2 mt-1" />
              <FormRow label="Eski E-posta Onay Kodu" hint="Mevcut adresinize gönderilen kod">
                <Input value={oldEmailOtp} onChange={e => setOldEmailOtp(e.target.value)} type="text" placeholder="123456" />
              </FormRow>
              <FormRow label="Yeni E-posta Onay Kodu" hint="Yeni adresinize gönderilen kod">
                <Input value={newEmailOtp} onChange={e => setNewEmailOtp(e.target.value)} type="text" placeholder="123456" />
              </FormRow>

              <div className="md:col-span-2 mt-2">
                <button
                  onClick={handleVerifyEmailOtp}
                  disabled={emailSaving || !oldEmailOtp || !newEmailOtp}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-stone-950 font-extrabold px-6 py-2.5 rounded-xl transition-all text-xs active:scale-95 shadow-lg shadow-amber-500/20"
                >
                  {emailSaving ? 'Doğrulanıyor...' : 'Kodları Doğrula ve Güncelle'}
                </button>
                {emailMsg.text && (
                  <p
                    className={`text-xs font-bold mt-2 text-center ${
                      emailMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {emailMsg.text}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Güvenlik ve Şifre"
        description="Hesap güvenliğiniz için şifrenizi güçlü tutun ve kimseyle paylaşmayın."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="Yeni Şifre">
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {password.length > 0 && (
              <div className="mt-2 animate-fadeIn space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map(idx => (
                    <div
                      key={idx}
                      className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                        pwdScore > idx ? strengthColors[pwdScore] : 'bg-stone-800'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-[11px] font-bold text-right ${strengthTextColors[pwdScore]}`}>
                  {strengthLabels[pwdScore]}
                </p>
              </div>
            )}
          </FormRow>
          <FormRow label="Yeni Şifre (Tekrar)">
            <PasswordInput
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {passwordConfirm.length > 0 && (
              <div className="mt-2 text-xs font-semibold flex items-center gap-1 animate-fadeIn">
                {password === passwordConfirm ? (
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    ✓ Şifreler eşleşiyor
                  </span>
                ) : (
                  <span className="text-rose-400 flex items-center gap-1 font-bold">
                    ✕ Şifreler eşleşmiyor
                  </span>
                )}
              </div>
            )}
          </FormRow>

          <div className="md:col-span-2 mt-2">
            {!showPwdOtpInput ? (
              <button
                onClick={handleRequestPasswordOtp}
                disabled={pwdSaving || !password || !passwordConfirm}
                className="w-full bg-stone-800 hover:bg-stone-700 disabled:opacity-50 border border-stone-700 text-white font-extrabold px-6 py-2.5 rounded-xl transition-all text-xs active:scale-95"
              >
                {pwdSaving ? 'İşleniyor...' : 'Şifreyi Güncellemek İçin Doğrulama Kodu Gönder'}
              </button>
            ) : null}
            {pwdMsg.text && !showPwdOtpInput && (
              <p
                className={`text-xs font-bold mt-2 text-center ${
                  pwdMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {pwdMsg.text}
              </p>
            )}
          </div>

          {showPwdOtpInput && (
            <>
              <div className="md:col-span-2 border-t border-stone-800/80 pt-2 mt-1" />
              <FormRow label="Şifre Değiştirme Onay Kodu" hint="E-posta adresinize gönderilen 6 haneli kod">
                <Input value={pwdOtp} onChange={e => setPwdOtp(e.target.value)} type="text" placeholder="123456" />
              </FormRow>

              <div className="md:col-span-2 mt-2">
                <button
                  onClick={handleVerifyPasswordOtp}
                  disabled={pwdSaving || !pwdOtp}
                  className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-stone-950 font-extrabold px-6 py-2.5 rounded-xl transition-all text-xs active:scale-95 shadow-lg shadow-amber-500/20"
                >
                  {pwdSaving ? 'Doğrulanıyor...' : 'Kodu Doğrula ve Şifreyi Güncelle'}
                </button>
                {pwdMsg.text && (
                  <p
                    className={`text-xs font-bold mt-2 text-center ${
                      pwdMsg.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {pwdMsg.text}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
