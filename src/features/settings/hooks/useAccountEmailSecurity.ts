import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { EMPTY_ACCOUNT_MESSAGE, type AccountMessage } from '../account-security'

export function useAccountEmailSecurity() {
  const supabase = useMemo(() => createClient(), [])
  const [currentEmail, setCurrentEmail] = useState('')
  const [email, setEmail] = useState('')
  const [oldEmailOtp, setOldEmailOtp] = useState('')
  const [newEmailOtp, setNewEmailOtp] = useState('')
  const [showOtpInput, setShowOtpInput] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<AccountMessage>(EMPTY_ACCOUNT_MESSAGE)

  useEffect(() => {
    let active = true
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (active && user) setCurrentEmail(user.email ?? '')
    })
    return () => {
      active = false
    }
  }, [supabase])

  const requestChange = async () => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail || normalizedEmail === currentEmail) return

    setSaving(true)
    setMessage(EMPTY_ACCOUNT_MESSAGE)
    const { error } = await supabase.auth.updateUser({ email: normalizedEmail })

    if (error) {
      setMessage({ text: `Hata: ${error.message}`, type: 'error' })
    } else {
      setEmail(normalizedEmail)
      setMessage({
        text: 'Mevcut ve yeni e-posta adreslerinize birer doğrulama kodu gönderildi.',
        type: 'success',
      })
      setShowOtpInput(true)
    }
    setSaving(false)
  }

  const verifyChange = async () => {
    if (!oldEmailOtp || !newEmailOtp) {
      setMessage({ text: 'Lütfen her iki kodu da giriniz.', type: 'error' })
      return
    }

    setSaving(true)
    setMessage(EMPTY_ACCOUNT_MESSAGE)
    const { error: oldEmailError } = await supabase.auth.verifyOtp({
      email: currentEmail,
      token: oldEmailOtp,
      type: 'email_change',
    })

    if (oldEmailError) {
      setMessage({ text: 'Mevcut e-postanıza gönderilen kod hatalı veya süresi dolmuş.', type: 'error' })
      setSaving(false)
      return
    }

    const { error: newEmailError } = await supabase.auth.verifyOtp({
      email,
      token: newEmailOtp,
      type: 'email_change',
    })

    if (newEmailError) {
      setMessage({ text: 'Yeni e-postanıza gönderilen kod hatalı veya süresi dolmuş.', type: 'error' })
      setSaving(false)
      return
    }

    setMessage({ text: 'E-posta adresiniz başarıyla güncellendi.', type: 'success' })
    setCurrentEmail(email)
    setShowOtpInput(false)
    setOldEmailOtp('')
    setNewEmailOtp('')
    await logActivity('Ayarlar', 'GUNCELLEME', 'Kullanıcı e-posta adresi güncellendi.', {
      detay: `Yeni Email: ${email}`,
    })
    setSaving(false)
  }

  return {
    currentEmail,
    email,
    setEmail,
    oldEmailOtp,
    setOldEmailOtp,
    newEmailOtp,
    setNewEmailOtp,
    showOtpInput,
    saving,
    message,
    requestChange,
    verifyChange,
  }
}
