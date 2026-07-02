'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'

// ─── Types ───────────────────────────────────────────────────────────────────
type Tab = 'profil' | 'genel' | 'finansal' | 'bildirimler' | 'ekip' | 'entegrasyonlar'

type Settings = {
  // Genel
  business_logo: string
  business_name: string
  business_address: string
  business_phone: string
  business_tax_no: string
  work_hours_start: string
  work_hours_end: string
  working_days_per_month: string
  daily_work_hours: string
  language: string
  theme: string
  // Finansal
  target_margin: string
  takeaway_ratio: string
  default_vat: string
  currency: string
  price_rounding: string
  cost_method: string
  // Bildirimler
  notify_critical_stock: boolean
  notify_low_margin: boolean
  notify_daily_revenue: boolean
  notify_supplier_price: boolean
  whatsapp_number: string
  // Kategoriler
  material_categories: string[]
  // Stok & Sayım
  inventory_count_day: string
}

const DEFAULT_SETTINGS: Settings = {
  business_logo: '',
  business_name: '',
  business_address: '',
  business_phone: '',
  business_tax_no: '',
  work_hours_start: '08:00',
  work_hours_end: '22:00',
  working_days_per_month: '26',
  daily_work_hours: '14',
  language: 'tr',
  theme: 'dark',
  target_margin: '35',
  takeaway_ratio: '60',
  default_vat: '10',
  currency: 'TRY',
  price_rounding: 'nearest',
  cost_method: 'equal',
  notify_critical_stock: true,
  notify_low_margin: true,
  notify_daily_revenue: false,
  notify_supplier_price: false,
  whatsapp_number: '',
  material_categories: ['Süt Ürünleri', 'Kuru Gıda', 'Ambalaj ve Sarf', 'Kahve & Çay', 'Manav', 'Şuruplar ve Soslar', 'Temizlik', 'Diğer'],
  inventory_count_day: '1',
}

const SETTINGS_LABELS: Record<string, string> = {
  business_name: 'İşletme Adı',
  business_phone: 'Telefon Numarası',
  business_tax_no: 'Vergi Numarası',
  business_address: 'Adres',
  work_hours_start: 'Açılış Saati',
  work_hours_end: 'Kapanış Saati',
  working_days_per_month: 'Aylık Çalışma Günü',
  daily_work_hours: 'Günlük Çalışma Saati',
  language: 'Dil',
  target_margin: 'Hedef Kâr Marjı (%)',
  takeaway_ratio: 'Paket Servis Oranı (%)',
  default_vat: 'Varsayılan KDV Oranı (%)',
  currency: 'Para Birimi',
  price_rounding: 'Fiyat Yuvarlama Kuralı',
  cost_method: 'Gider Paylaştırma Yöntemi',
  notify_critical_stock: 'Kritik Stok Uyarısı',
  notify_low_margin: 'Düşük Kâr Marjı Uyarısı',
  notify_daily_revenue: 'Günlük Ciro Hedefi Bildirimi',
  notify_supplier_price: 'Tedarikçi Fiyat Değişimi',
  inventory_count_day: 'Aylık Sabit Sayım Günü'
}

// ─── Sub Components ───────────────────────────────────────────────────────────

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-stone-800">
        <h3 className="font-semibold text-white text-base">{title}</h3>
        <p className="text-stone-500 text-sm mt-0.5">{description}</p>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-stone-300 text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-stone-500 text-xs">{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', autoComplete }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; autoComplete?: string }) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div className="relative w-full flex items-center">
      <input
        type={inputType}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 transition-all ${isPassword ? 'pr-10' : ''}`}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 text-stone-400 hover:text-stone-200 focus:outline-none transition-colors"
          title={showPassword ? 'Şifreyi Gizle' : 'Şifreyi Göster'}
        >
          {showPassword ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
          )}
        </button>
      )}
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400 transition-all"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-800 last:border-0">
      <div>
        <p className="text-stone-200 font-medium text-sm">{label}</p>
        <p className="text-stone-500 text-xs mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-amber-500' : 'bg-stone-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

// ─── Tab Panels ───────────────────────────────────────────────────────────────

function ProfilTab() {
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
  }, [])

  const handleUpdateEmail = async () => {
    if (email === currentEmail) return
    setEmailSaving(true)
    setEmailMsg({ text: '', type: '' })
    
    const { error } = await supabase.auth.updateUser({ email })
    if (error) {
      setEmailMsg({ text: 'Hata: ' + error.message, type: 'error' })
    } else {
      setEmailMsg({ text: 'Mevcut ve yeni e-posta adreslerinize birer doğrulama kodu gönderildi.', type: 'success' })
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

    // 1. Eski E-postaya giden kodu doğrula
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

    // 2. Yeni E-postaya giden kodu doğrula
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
    await logActivity('Ayarlar', 'GUNCELLEME', 'Kullanıcı e-posta adresi güncellendi.', { detay: `Yeni Email: ${email}` })
    setEmailSaving(false)
  }

  // Şifre Gücü Hesaplama
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
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-amber-400', 'bg-green-400', 'bg-emerald-500']
  const strengthTextColors = ['text-red-500', 'text-orange-500', 'text-amber-400', 'text-green-400', 'text-emerald-500']
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
      await logActivity('Ayarlar', 'GUNCELLEME', 'Kullanıcı şifresi doğrulama kodu ile güncellendi.', { detay: 'Şifre değiştirildi.' })
    }
    setPwdSaving(false)
  }

  return (
    <div className="space-y-6">
      <SectionCard title="E-Posta Adresi" description="Sisteme giriş yaparken kullandığınız e-posta adresi.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="Mevcut E-posta Adresi">
            <div className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-stone-500 text-sm font-medium flex items-center h-[38px] cursor-not-allowed">
              {currentEmail || 'Yükleniyor...'}
            </div>
          </FormRow>
          <FormRow label="Yeni E-posta Adresi">
            <Input value={email} onChange={setEmail} type="email" autoComplete="off" />
          </FormRow>

          <div className="md:col-span-2 mt-2">
            {!showOtpInput ? (
              <button 
                onClick={handleUpdateEmail} 
                disabled={emailSaving || email === currentEmail || !email}
                className="w-full bg-stone-800 hover:bg-stone-700 disabled:opacity-60 border border-stone-700 text-stone-200 font-bold px-6 py-3 rounded-xl transition-all text-sm"
              >
                {emailSaving ? 'Gönderiliyor...' : 'Doğrulama Kodlarını Gönder'}
              </button>
            ) : null}
            {emailMsg.text && !showOtpInput && <p className={`text-sm font-medium mt-2 text-center ${emailMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{emailMsg.text}</p>}
          </div>

          {showOtpInput && (
            <>
              <div className="md:col-span-2 border-t border-stone-800/50 pt-2 mt-1"></div>
              <FormRow label="Eski E-posta Onay Kodu" hint="Mevcut adresinize gönderilen kod">
                <Input value={oldEmailOtp} onChange={setOldEmailOtp} type="text" placeholder="123456" />
              </FormRow>
              <FormRow label="Yeni E-posta Onay Kodu" hint="Yeni adresinize gönderilen kod">
                <Input value={newEmailOtp} onChange={setNewEmailOtp} type="text" placeholder="123456" />
              </FormRow>

              <div className="md:col-span-2 mt-2">
                <button 
                  onClick={handleVerifyEmailOtp} 
                  disabled={emailSaving || !oldEmailOtp || !newEmailOtp}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-bold px-6 py-3 rounded-xl transition-all text-sm"
                >
                  {emailSaving ? 'Doğrulanıyor...' : 'Kodları Doğrula ve Güncelle'}
                </button>
                {emailMsg.text && <p className={`text-sm font-medium mt-2 text-center ${emailMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{emailMsg.text}</p>}
              </div>
            </>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Güvenlik ve Şifre" description="Hesap güvenliğiniz için şifrenizi güçlü tutun ve kimseyle paylaşmayın.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="Yeni Şifre">
            <Input value={password} onChange={setPassword} type="password" placeholder="••••••••" autoComplete="new-password" />
            {password.length > 0 && (
              <div className="mt-2 animate-fade-in">
                <div className="flex gap-1 mb-1.5">
                  {[0, 1, 2, 3].map(idx => (
                    <div 
                      key={idx} 
                      className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
                        pwdScore > idx ? strengthColors[pwdScore] : 'bg-stone-800'
                      }`}
                    />
                  ))}
                </div>
                <p className={`text-xs font-semibold text-right transition-colors duration-300 ${strengthTextColors[pwdScore]}`}>
                  {strengthLabels[pwdScore]}
                </p>
              </div>
            )}
          </FormRow>
          <FormRow label="Yeni Şifre (Tekrar)">
            <Input value={passwordConfirm} onChange={setPasswordConfirm} type="password" placeholder="••••••••" autoComplete="new-password" />
            {passwordConfirm.length > 0 && (
              <div className="mt-2 text-xs font-semibold flex items-center gap-1 animate-fade-in">
                {password === passwordConfirm ? (
                  <span className="text-green-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    Şifreler eşleşiyor
                  </span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    Şifreler eşleşmiyor
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
                className="w-full bg-stone-800 hover:bg-stone-700 disabled:opacity-60 border border-stone-700 text-stone-200 font-bold px-6 py-3 rounded-xl transition-all text-sm"
              >
                {pwdSaving ? 'İşleniyor...' : 'Şifreyi Güncellemek İçin Doğrulama Kodu Gönder'}
              </button>
            ) : null}
            {pwdMsg.text && !showPwdOtpInput && <p className={`text-sm font-medium mt-2 text-center ${pwdMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{pwdMsg.text}</p>}
          </div>

          {showPwdOtpInput && (
            <>
              <div className="md:col-span-2 border-t border-stone-800/50 pt-2 mt-1"></div>
              <FormRow label="Şifre Değiştirme Onay Kodu" hint="E-posta adresinize gönderilen 6 haneli kod">
                <Input value={pwdOtp} onChange={setPwdOtp} type="text" placeholder="123456" />
              </FormRow>
              
              <div className="md:col-span-2 mt-2">
                <button 
                  onClick={handleVerifyPasswordOtp} 
                  disabled={pwdSaving || !pwdOtp}
                  className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-bold px-6 py-3 rounded-xl transition-all text-sm"
                >
                  {pwdSaving ? 'Doğrulanıyor...' : 'Kodu Doğrula ve Şifreyi Güncelle'}
                </button>
                {pwdMsg.text && <p className={`text-sm font-medium mt-2 text-center ${pwdMsg.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>{pwdMsg.text}</p>}
              </div>
            </>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

function GenelTab({ s, set, onSave, saving }: { s: Settings; set: (k: keyof Settings, v: any) => void; onSave: () => void; saving: boolean }) {
  const { showAlert } = useNotification()
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const supabase = createClient()

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    
    const { data, error } = await supabase.storage
      .from('motto_assets')
      .upload(`logos/${fileName}`, file, { upsert: true })

    if (error) {
      await showAlert('Logo yüklenirken hata oluştu: ' + error.message, 'error')
      setUploadingLogo(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('motto_assets')
      .getPublicUrl(`logos/${fileName}`)

    set('business_logo', publicUrl)
    setUploadingLogo(false)
  }

  return (
    <div className="space-y-6">
      <SectionCard title="İşletme Logosu" description="Menüde ve faturalarda gösterilecek logonuz.">
        <div className="flex items-center gap-6">
          <div className="w-24 h-24 rounded-2xl bg-stone-800 border-2 border-dashed border-stone-700 flex items-center justify-center overflow-hidden shrink-0 relative p-2">
            {s.business_logo ? (
              <img src={s.business_logo} alt="Logo" className="w-full h-full object-contain" />
            ) : (
              <span className="text-3xl">🏢</span>
            )}
            {uploadingLogo && (
              <div className="absolute inset-0 bg-stone-900/70 flex items-center justify-center backdrop-blur-sm">
                 <span className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="bg-stone-800 hover:bg-stone-700 text-white font-medium px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm border border-stone-700 inline-block mb-2">
              {s.business_logo ? 'Logoyu Değiştir' : 'Logo Yükle'}
              <input type="file" accept="image/png, image/jpeg, image/jpg, image/svg+xml" onChange={handleLogoUpload} disabled={uploadingLogo} className="hidden" />
            </label>
            <p className="text-stone-500 text-xs">PNG, JPG veya SVG. Kare veya yatay format önerilir.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="İşletme Profili" description="Faturalar ve raporlarda görünecek işletme bilgileri.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="İşletme Adı">
            <Input value={s.business_name} onChange={v => set('business_name', v)} placeholder="Motto Café" />
          </FormRow>
          <FormRow label="Telefon Numarası">
            <Input value={s.business_phone} onChange={v => set('business_phone', v)} placeholder="+90 532 000 0000" />
          </FormRow>
          <FormRow label="Vergi Numarası">
            <Input value={s.business_tax_no} onChange={v => set('business_tax_no', v)} placeholder="1234567890" />
          </FormRow>
          <FormRow label="Dil">
            <Select value={s.language} onChange={v => set('language', v)} options={[{ label: 'Türkçe', value: 'tr' }, { label: 'English', value: 'en' }]} />
          </FormRow>
          <FormRow label="Adres" hint="Z raporu ve belgeler için kullanılır.">
            <Input value={s.business_address} onChange={v => set('business_address', v)} placeholder="Bağcılar Mah. Atatürk Cad. No:12, İstanbul" />
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title="Çalışma Saatleri" description="Saatlik gider hesabı ve raporlama için kullanılır.">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FormRow label="Açılış Saati">
            <Input type="time" value={s.work_hours_start} onChange={v => set('work_hours_start', v)} />
          </FormRow>
          <FormRow label="Kapanış Saati">
            <Input type="time" value={s.work_hours_end} onChange={v => set('work_hours_end', v)} />
          </FormRow>
          <FormRow label="Aylık Çalışma Günü" hint="Tatil günleri hariç">
            <Input type="number" value={s.working_days_per_month} onChange={v => set('working_days_per_month', v)} />
          </FormRow>
          <FormRow label="Günlük Çalışma Saati" hint="Gider paylaştırma için">
            <Input type="number" value={s.daily_work_hours} onChange={v => set('daily_work_hours', v)} />
          </FormRow>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  )
}

function FinansalTab({ s, set, onSave, saving, categories, setCategories }: {
  s: Settings; set: (k: keyof Settings, v: any) => void; onSave: () => void; saving: boolean
  categories: string[]; setCategories: (cats: string[]) => void
}) {
  const [newCat, setNewCat] = useState('')
  const supabase = createClient()

  const handleAddCat = async () => {
    if (!newCat.trim() || categories.includes(newCat.trim())) return
    const updated = [...categories, newCat.trim()]
    setCategories(updated)
    set('material_categories', updated)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('settings').upsert({ key: 'material_categories', value: updated, user_id: user?.id }, { onConflict: 'key' })
    await logActivity('Ayarlar', 'EKLEME', `Yeni hammadde kategorisi eklendi`, { detay: newCat.trim() })
    setNewCat('')
  }

  const handleRemoveCat = async (cat: string) => {
    const updated = categories.filter(c => c !== cat)
    setCategories(updated)
    set('material_categories', updated)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('settings').upsert({ key: 'material_categories', value: updated, user_id: user?.id }, { onConflict: 'key' })
    await logActivity('Ayarlar', 'SILME', `Hammadde kategorisi silindi`, { detay: cat })
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Fiyat & Maliyet Ayarları" description="Hesaplama motorlarının temel parametreleri.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="Hedef Minimum Kâr Marjı (%)" hint="Bu değerin altındaki ürünler kırmızı uyarı verir.">
            <div className="flex gap-2 items-center">
              <Input type="number" value={s.target_margin} onChange={v => set('target_margin', v)} />
              <span className="text-stone-400 font-bold text-sm">%</span>
            </div>
          </FormRow>
          <FormRow label="Paket Servis Oranı (%)" hint="Yapay zeka reçete ve ambalaj maliyet hesabı için.">
            <div className="flex gap-2 items-center">
              <Input type="number" value={s.takeaway_ratio} onChange={v => set('takeaway_ratio', v)} />
              <span className="text-stone-400 font-bold text-sm">%</span>
            </div>
          </FormRow>
          <FormRow label="Varsayılan KDV Oranı (%)">
            <Select value={s.default_vat} onChange={v => set('default_vat', v)} options={[
              { label: '%1', value: '1' },
              { label: '%10', value: '10' },
              { label: '%20', value: '20' },
            ]} />
          </FormRow>
          <FormRow label="Para Birimi">
            <Select value={s.currency} onChange={v => set('currency', v)} options={[
              { label: '₺ Türk Lirası (TRY)', value: 'TRY' },
              { label: '$ Amerikan Doları (USD)', value: 'USD' },
              { label: '€ Euro (EUR)', value: 'EUR' },
            ]} />
          </FormRow>
          <FormRow label="Fiyat Yuvarlama Kuralı" hint="₺34.15 için ne yapılsın?">
            <Select value={s.price_rounding} onChange={v => set('price_rounding', v)} options={[
              { label: 'En Yakın Tam Sayı (₺34)', value: 'nearest' },
              { label: 'Yukarı Yuvarla (₺35)', value: 'ceil' },
              { label: 'Aşağı Yuvarla (₺34)', value: 'floor' },
              { label: 'En Yakın 5\'e Yuvarla (₺35)', value: 'nearest5' },
              { label: 'Yuvarlama Yapma', value: 'none' },
            ]} />
          </FormRow>
          <FormRow label="Gider Paylaştırma Yöntemi">
            <Select value={s.cost_method} onChange={v => set('cost_method', v)} options={[
              { label: 'Eşit Dağıtım', value: 'equal' },
              { label: 'Ciro Ağırlıklı', value: 'revenue' },
              { label: 'Hibrit (%50 Eşit + %50 Ciro)', value: 'hybrid' },
            ]} />
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title="Stok & Sayım Ayarları" description="Depo yönetimi ve sayım hatırlatıcı kuralları.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormRow label="Aylık Sabit Sayım Günü" hint="Her ayın hangi günü sayım yapılması gerekiyor? (1-31)">
            <Input type="number" value={s.inventory_count_day} onChange={v => set('inventory_count_day', v)} placeholder="1" />
          </FormRow>
        </div>
      </SectionCard>

      <SectionCard title="Hammadde Kategorileri" description="Hammadde listesinde filtreleme ve gruplamaoda kullanılır.">
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddCat()}
            placeholder="Yeni kategori ekle..."
            className="flex-1 bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
          />
          <button onClick={handleAddCat} className="bg-stone-700 hover:bg-stone-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            + Ekle
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {categories.map((cat, i) => (
            <div key={i} className="bg-stone-800 border border-stone-700 rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span className="text-stone-300 text-sm font-medium">{cat}</span>
              <button onClick={() => handleRemoveCat(cat)} className="text-stone-600 hover:text-red-400 text-xs transition-colors">✕</button>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  )
}

function BildirimlerTab({ s, set, onSave, saving }: { s: Settings; set: (k: keyof Settings, v: any) => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Uygulama Bildirimleri" description="Dashboard'da hangi uyarı türleri gösterilsin?">
        <div>
          <Toggle checked={s.notify_critical_stock} onChange={v => set('notify_critical_stock', v)}
            label="Kritik Stok Uyarısı"
            description="Bir hammadde kritik stok seviyesinin altına düştüğünde uyar." />
          <Toggle checked={s.notify_low_margin} onChange={v => set('notify_low_margin', v)}
            label="Düşük Kâr Marjı Uyarısı"
            description="Hedef marjın altında kalan ürünler için uyarı göster." />
          <Toggle checked={s.notify_daily_revenue} onChange={v => set('notify_daily_revenue', v)}
            label="Günlük Ciro Hedefi Bildirimi"
            description="Günlük ciro hedefine ulaşıldığında bildirim al." />
          <Toggle checked={s.notify_supplier_price} onChange={v => set('notify_supplier_price', v)}
            label="Tedarikçi Fiyat Değişimi"
            description="Hammadde fiyatları güncellendiğinde uyarı ver." />
        </div>
      </SectionCard>

      <SectionCard title="WhatsApp Bildirimleri" description="Kritik uyarılar ve stok listeleri WhatsApp'a gönderilebilir.">
        <FormRow label="WhatsApp Numarası" hint="Uluslararası formatta girin: +90 532 000 0000">
          <Input value={s.whatsapp_number} onChange={v => set('whatsapp_number', v)} placeholder="+90 532 000 0000" />
        </FormRow>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton onClick={onSave} saving={saving} />
      </div>
    </div>
  )
}

function EkipTab() {
  const teamMembers = [
    { name: 'Yönetici', email: 'yonetici@motto.com', role: 'Yönetici', status: 'active' },
  ]

  return (
    <div className="space-y-6">
      <SectionCard title="Ekip Üyeleri" description="Sisteme erişim izni olan kullanıcılar.">
        <div className="space-y-3 mb-6">
          {teamMembers.map((m, i) => (
            <div key={i} className="flex items-center justify-between bg-stone-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 font-bold text-sm">
                  {m.name[0]}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">{m.name}</p>
                  <p className="text-stone-400 text-xs">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-amber-500/10 text-amber-400 text-xs px-2.5 py-1 rounded-full font-medium">{m.role}</span>
                <span className="bg-green-500/10 text-green-400 text-xs px-2.5 py-1 rounded-full font-medium">Aktif</span>
              </div>
            </div>
          ))}
        </div>

        <div className="border border-dashed border-stone-700 rounded-xl p-6 text-center">
          <p className="text-stone-500 text-sm mb-1">🚀 Yakında</p>
          <p className="text-stone-600 text-xs">Ekip üyesi davet etme ve rol yönetimi yakında aktif olacak.</p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-left opacity-40 pointer-events-none select-none">
            {['Kasiyyer — Sadece POS', 'Mutfak — Sadece Stok', 'Muhasebeci — Raporlar'].map(r => (
              <div key={r} className="bg-stone-800 rounded-lg px-3 py-2.5 text-xs text-stone-400">{r}</div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Aktivite Logu" description="Sistemde kimin ne zaman ne yaptığını takip edin.">
        <div className="border border-dashed border-stone-700 rounded-xl p-6 text-center">
          <p className="text-stone-500 text-sm mb-1">📋 Yakında</p>
          <p className="text-stone-600 text-xs">Aktivite kaydı takibi yakında kullanılabilir olacak.</p>
        </div>
      </SectionCard>
    </div>
  )
}

function EntegrasyonlarTab({ s, set }: { s: Settings; set: (k: keyof Settings, v: any) => void }) {
  const integrations = [
    { name: 'Paraşüt', description: 'Muhasebe yazılımı entegrasyonu', icon: '📑', tag: 'Yakında' },
    { name: 'Logo', description: 'ERP entegrasyonu', icon: '🔗', tag: 'Yakında' },
    { name: 'İyzico / PayTR', description: 'Online ödeme entegrasyonu', icon: '💳', tag: 'Yakında' },
    { name: 'Getir / Yemeksepeti', description: 'Paket sipariş platformları', icon: '🛵', tag: 'Yakında' },
  ]

  return (
    <div className="space-y-6">
      <SectionCard title="POS Sistemi" description="Mevcut kasa sisteminizle bağlantı kurarak satışları otomatik aktarın.">
        <div className="border border-dashed border-stone-700 rounded-xl p-6 text-center">
          <p className="text-stone-500 text-sm mb-1">🖥️ Yakında</p>
          <p className="text-stone-600 text-xs">Destek verilecek POS sistemleri: Adisyo, Linga, Lightspeed, SquarePOS</p>
        </div>
      </SectionCard>

      <SectionCard title="Diğer Entegrasyonlar" description="İşletme yazılımlarınızla Motto'yu birbirine bağlayın.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {integrations.map(int => (
            <div key={int.name} className="flex items-center justify-between bg-stone-800 border border-stone-700 rounded-xl px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{int.icon}</span>
                <div>
                  <p className="text-white font-medium text-sm">{int.name}</p>
                  <p className="text-stone-500 text-xs">{int.description}</p>
                </div>
              </div>
              <span className="bg-stone-700 text-stone-400 text-xs px-2.5 py-1 rounded-full">{int.tag}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function SaveButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-stone-950 font-bold px-6 py-2.5 rounded-xl transition-all flex items-center gap-2 text-sm"
    >
      {saving ? (
        <>
          <span className="w-4 h-4 border-2 border-stone-800 border-t-transparent rounded-full animate-spin" />
          Kaydediliyor...
        </>
      ) : (
        <>✓ Kaydet</>
      )}
    </button>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="fixed bottom-6 right-6 bg-stone-800 border border-stone-700 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 z-50 animate-fade-in">
      <span className="text-green-400 text-lg">✓</span>
      <span className="text-sm font-medium">{message}</span>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Ayarlar() {
  const { showAlert } = useNotification()
  const [activeTab, setActiveTab] = useState<'genel' | 'kullanici' | 'kasa' | 'kategori' | 'entegrasyon'>('genel')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [initialSettings, setInitialSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [categories, setCategories] = useState<string[]>(DEFAULT_SETTINGS.material_categories)

  const supabase = createClient()

  useEffect(() => { 
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab') as Tab
      if (tab && ['profil', 'genel', 'finansal', 'bildirimler', 'ekip', 'entegrasyonlar'].includes(tab)) {
        setActiveTab(tab)
      }
    }
    fetchSettings() 
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    const { data } = await supabase.from('settings').select('*')
    if (data) {
      const merged = { ...DEFAULT_SETTINGS }
      data.forEach(row => {
        const key = row.key as keyof Settings
        if (key === 'material_categories') {
          const cats = Array.isArray(row.value) ? row.value : JSON.parse(row.value || '[]')
          ;(merged as any)[key] = cats
          setCategories(cats)
        } else if (key === 'notify_critical_stock' || key === 'notify_low_margin' || key === 'notify_daily_revenue' || key === 'notify_supplier_price') {
          ;(merged as any)[key] = row.value === true || row.value === 'true'
        } else {
          ;(merged as any)[key] = row.value
        }
      })
      setSettings(merged)
      setInitialSettings(merged)
    }
    setLoading(false)
  }

  const set = (key: keyof Settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    const entries = Object.entries(settings).filter(([k]) => k !== 'material_categories')
    
    const changes: string[] = []
    for (const [key, value] of entries) {
      const initialVal = (initialSettings as any)[key]
      if (value !== initialVal) {
        const label = SETTINGS_LABELS[key] || key
        
        // Boolean değerleri daha okunaklı yapalım
        const formatVal = (v: any) => v === true ? 'Açık' : v === false ? 'Kapalı' : v
        changes.push(`${label} (${formatVal(initialVal)} -> ${formatVal(value)})`)
      }
    }

    if (changes.length > 0) {
      const { data: { user } } = await supabase.auth.getUser()
      for (const [key, value] of entries) {
        await supabase.from('settings').upsert({ key, value, user_id: user?.id }, { onConflict: 'key' })
      }
      const changeText = changes.join(' | ')
      await logActivity('Ayarlar', 'GUNCELLEME', `Sistem genel ayarları güncellendi.`, { detay: changeText })
      setInitialSettings(settings)
    }

    setToast('Ayarlar başarıyla kaydedildi.')
    setSaving(false)
    
    // Sidebar gibi componentlerin global state kullanmadığı için
    // menüdeki Logo ve İşletme Adı gibi verilerin yenilenmesini sağla
    setTimeout(() => {
      window.location.reload()
    }, 1500)
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'genel', label: 'Genel', icon: '🏪' },
    { id: 'profil', label: 'Profilim', icon: '👤' },
    { id: 'finansal', label: 'Finansal', icon: '💰' },
    { id: 'bildirimler', label: 'Bildirimler', icon: '🔔' },
    { id: 'ekip', label: 'Ekip', icon: '👥' },
    { id: 'entegrasyonlar', label: 'Entegrasyonlar', icon: '🔗' },
  ]

  if (loading) {
    return (
      <div className="min-h-full bg-stone-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-stone-400 text-sm">Ayarlar yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-stone-950 text-white">
      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚙️</span>
          <div>
            <h1 className="font-bold text-amber-400 text-lg leading-none">Ayarlar</h1>
            <p className="text-stone-500 text-xs mt-0.5">İşletmenizi kendi ihtiyaçlarınıza göre yapılandırın</p>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <div className="bg-stone-900/50 border-b border-stone-800 px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-stone-400 hover:text-white hover:border-stone-700'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="p-6 max-w-4xl mx-auto">
        {activeTab === 'profil' && <ProfilTab />}
        {activeTab === 'genel' && <GenelTab s={settings} set={set} onSave={handleSave} saving={saving} />}
        {activeTab === 'finansal' && <FinansalTab s={settings} set={set} onSave={handleSave} saving={saving} categories={categories} setCategories={setCategories} />}
        {activeTab === 'bildirimler' && <BildirimlerTab s={settings} set={set} onSave={handleSave} saving={saving} />}
        {activeTab === 'ekip' && <EkipTab />}
        {activeTab === 'entegrasyonlar' && <EntegrasyonlarTab s={settings} set={set} />}
      </main>

      {/* Toast */}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </div>
  )
}
