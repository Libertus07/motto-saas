import type { LucideIcon } from 'lucide-react'
import {
  Boxes,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  CookingPot,
  History,
  Landmark,
  PackageSearch,
  ReceiptText,
  Settings2,
  Sparkles,
  WalletCards,
} from 'lucide-react'

export type DashboardModule = {
  description: string
  icon: LucideIcon
  path: string
  title: string
}

export const dashboardModules: DashboardModule[] = [
  {
    icon: ClipboardList,
    title: 'Ürünler',
    description: 'Menü, reçete ve ürün maliyetleri',
    path: '/dashboard/urunler',
  },
  {
    icon: Boxes,
    title: 'Hammaddeler',
    description: 'Malzeme listesi ve alış fiyatları',
    path: '/dashboard/hammaddeler',
  },
  { icon: PackageSearch, title: 'Stok Takibi', description: 'Giriş, çıkış, sayım ve fire', path: '/dashboard/stok' },
  {
    icon: CookingPot,
    title: 'Üretim Reçeteleri',
    description: 'Yarı mamul ve üretim süreçleri',
    path: '/dashboard/yari-mamuller',
  },
  { icon: ReceiptText, title: 'Giderler', description: 'Kira, personel ve faturalar', path: '/dashboard/giderler' },
  {
    icon: Sparkles,
    title: 'Fiyat Motoru',
    description: 'Veriye dayalı satış fiyatı önerileri',
    path: '/dashboard/fiyat-motoru',
  },
  { icon: Landmark, title: 'Finans & Kasa', description: 'Nakit ve banka hesapları', path: '/dashboard/finans' },
  { icon: WalletCards, title: 'Yatırımlar', description: 'Altın ve döviz portföyü', path: '/dashboard/yatirimlar' },
  {
    icon: Building2,
    title: 'Tedarikçiler',
    description: 'Toptancı ve cari hesap takibi',
    path: '/dashboard/tedarikciler',
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Raporlar',
    description: 'Kârlılık ve performans analizi',
    path: '/dashboard/raporlar',
  },
  {
    icon: History,
    title: 'İşlem Geçmişi',
    description: 'Sistem aktiviteleri ve denetim izi',
    path: '/dashboard/islem-gecmisi',
  },
  { icon: Settings2, title: 'Ayarlar', description: 'İşletme ve hesap yapılandırması', path: '/dashboard/ayarlar' },
]
