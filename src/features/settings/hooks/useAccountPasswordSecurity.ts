import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import {
  calculatePasswordStrength,
  EMPTY_ACCOUNT_MESSAGE,
  type AccountMessage,
} from '../account-security'

export function useAccountPasswordSecurity(currentEmail: string) {
  const supabase = useMemo(() => createClient(), [])
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [otp, setOtp] = useState('')
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<AccountMessage>(EMPTY_ACCOUNT_MESSAGE)

  const requestChange = async () => {
    if (password.length < 6) {
      setMessage({ text: 'Yeni şifre en az 6 karakter olmalıdır.', type: 'error' })
      return
    }
    if (password !== passwordConfirm) {
      setMessage({ text: 'Yeni şifreler eşleşmiyor.', type: 'error' })
      return
    }
    if (!currentEmail) {
      setMessage({ text: 'Hesap e-posta adresi yüklenemedi.', type: 'error' })
      return
    }

    setSaving(true)
    setMessage(EMPTY_ACCOUNT_MESSAGE)
    const { error } = await supabase.auth.resetPasswordForEmail(currentEmail)

    if (error) {
      setMessage({ text: `Hata: ${error.message}`, type: 'error' })
    } else {
      setMessage({ text: 'E-posta adresinize şifre doğrulama kodu gönderildi.', type: 'success' })
      setShowOtpInput(true)
    }
    setSaving(false)
  }

  const verifyChange = async () => {
    if (!otp || !currentEmail) return

    setSaving(true)
    setMessage(EMPTY_ACCOUNT_MESSAGE)
    const { error: otpError } = await supabase.auth.verifyOtp({
      email: currentEmail,
      token: otp,
      type: 'recovery',
    })

    if (otpError) {
      setMessage({ text: 'Kod hatalı veya süresi dolmuş.', type: 'error' })
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setMessage({ text: `Şifre güncellenirken hata oluştu: ${updateError.message}`, type: 'error' })
    } else {
      setMessage({ text: 'Şifreniz başarıyla güncellendi.', type: 'success' })
      setPassword('')
      setPasswordConfirm('')
      setOtp('')
      setShowOtpInput(false)
      await logActivity('Ayarlar', 'GUNCELLEME', 'Kullanıcı şifresi doğrulama kodu ile güncellendi.', {
        detay: 'Şifre değiştirildi.',
      })
    }
    setSaving(false)
  }

  return {
    password,
    setPassword,
    passwordConfirm,
    setPasswordConfirm,
    otp,
    setOtp,
    showOtpInput,
    saving,
    message,
    strength: calculatePasswordStrength(password),
    requestChange,
    verifyChange,
  }
}
