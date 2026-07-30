export type Tab = 'genel' | 'profil' | 'finansal' | 'bildirimler' | 'ekip' | 'entegrasyonlar'

export type Settings = {
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

export const DEFAULT_SETTINGS: Settings = {
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
  material_categories: [
    'Süt Ürünleri',
    'Kuru Gıda',
    'Ambalaj ve Sarf',
    'Kahve & Çay',
    'Manav',
    'Şuruplar ve Soslar',
    'Temizlik',
    'Diğer'
  ],
  inventory_count_day: '1'
}

export const SETTINGS_LABELS: Record<string, string> = {
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
