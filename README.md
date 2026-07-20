# Motto SaaS - Restoran & Kafe Yönetim Sistemi

Motto SaaS, kafeler ve restoranlar için geliştirilmiş, maliyet hesaplaması, stok yönetimi, yapay zeka destekli fatura okuma ve kasa takibini bir araya getiren modern bir bulut POS (Point of Sale) ve ERP sistemidir.

Bu proje, veri gizliliği (tenant izolasyonu), anlık maliyet (food cost) hesaplamaları ve otomatik reçetelendirme yetenekleri ile işletmelerin "ne kadar kar ediyorum?" sorusuna anlık ve kesin yanıt vermeyi amaçlar.

## 🚀 Öne Çıkan Özellikler

- **AI Destekli Fiş/Fatura Okuma:** Google Gemini entegrasyonu sayesinde yüklenen fatura fotoğraflarından ürün, miktar, birim fiyat ve KDV bilgisi otomatik okunur. Zeki eşleştirme algoritması sayesinde mevcut stok isimleri ile eşleştirilir.
- **Fiyat Motoru:** Ürün reçeteleri (hammadde ve alt reçeteler) üzerinden canlı food cost hesaplar. Ciro ağırlıklı genel gider dağıtımı ile **net kâr** oranını ve önerilen satış fiyatını sunar.
- **Gelişmiş Kasa & Finans:** Z-Raporu entegrasyonu, nakit ve POS kasa ayırımı, tedarikçi cari hesapları ve masraf fişleri modülleriyle uçtan uca finans takibi sağlar.
- **Güçlü Mimari:** Next.js 14 App Router, Supabase (Postgres, RLS), Tailwind CSS ve Recharts kullanılarak inşa edilmiştir.

---

## 🛠️ Modüller ve Çalışma Akışı

Sistemin temel modülleri `src/app/dashboard/` altında yer almaktadır:

1. **Stok & Hammadde (`/stok`, `/hammaddeler`):** En temel birimlerdir. Fiş yüklendiğinde (`/hammaddeler/fis-yukle`) otomatik olarak stok miktarı artar ve tedarikçinin cari hesabına borç yazılır.
2. **Yarı Mamuller (`/yari-mamuller`):** Hammaddelerden üretilen, kendi içerisinde "Fire Oranı" ve "Porsiyon" maliyeti barındıran alt reçetelerdir (Örn: Pizza Hamuru).
3. **Ürünler (`/urunler`):** Müşteriye satılan nihai ürünlerdir. Hammadde ve yarı mamuller kullanılarak reçeteleri oluşturulur, otomatik maliyet hesaplanır.
4. **Tedarikçiler (`/tedarikciler`):** Fatura kesilen kurumlar. Cari hesap takibi ve ödeme geçmişi bu modül altından izlenir.
5. **Kasa & Finans (`/kasa`, `/finans`, `/giderler`):** Z-Raporları üzerinden günlük satış adetleri girildiğinde kasa bakiyesi (Nakit/Kredi Kartı) güncellenir. Yapılan giderler kasadan otomatik düşülür.
6. **Fiyat Motoru (`/fiyat-motoru`):** Ürünlerin satıldığı adetler üzerinden aylık sabit/değişken gider dağılımı yaparak, her ürün için BCG matrisi ve başa baş noktası analizi sunar.
7. **Raporlar (`/raporlar`):** Geçmişe dönük Z-Raporları, yatırımlar ve kasa sayımları raporlanır.

---

## ⚙️ Kurulum Adımları

Projeyi kendi bilgisayarınızda çalıştırmak için aşağıdaki adımları izleyin.

### 1. Gereksinimler
- Node.js (v18.17 veya üzeri)
- Supabase Hesabı (Veritabanı ve Auth için)
- Google Gemini API Anahtarı (Yapay Zeka modülleri için)

### 2. Bağımlılıkları Yükleyin

Proje dizinine terminalden gidin ve paketleri yükleyin:

```bash
npm install
# veya
yarn install
```

### 3. Ortam Değişkenlerini (Env) Ayarlayın

Projenin kök dizininde `.env.local` adında bir dosya oluşturun ve aşağıdaki şablonu kendi bilgilerinizle doldurun:

```env
# --- SUPABASE BAĞLANTILARI ---
# Supabase Dashboard -> Settings -> API kısmından alınır.
NEXT_PUBLIC_SUPABASE_URL=https://[YOUR_PROJECT_ID].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[YOUR_ANON_KEY]

# Service Role Key, API rotalarındaki (server-side) admin yetkili işlemler için gereklidir.
SUPABASE_SERVICE_ROLE_KEY=[YOUR_SERVICE_ROLE_KEY]

# Doğrudan veritabanı bağlantısı için (Prisma, migration vb. işlemlerde gerekebilir)
DATABASE_URL=postgresql://postgres:[YOUR_PASSWORD]@db.[YOUR_PROJECT_ID].supabase.co:5432/postgres

# --- GOOGLE GEMINI AI ---
# Google AI Studio üzerinden alınır. Fatura okuma ve AI Kategori işlemleri için zorunludur.
GEMINI_API_KEY=[YOUR_GEMINI_KEY]
```

### 4. Geliştirme Sunucusunu Başlatın

```bash
npm run dev
# veya
yarn dev
```

Tarayıcınızda [http://localhost:3000](http://localhost:3000) adresine giderek uygulamayı görebilirsiniz.

### 5. Hata Ayıklama (Debug) Scriptleri

Eğer veritabanı veya yetkilendirme (RLS) hatalarını doğrudan terminalden hızlıca test etmek isterseniz, `scripts/debug/` klasörü altındaki `.mjs` uzantılı tek seferlik test dosyalarını kullanabilirsiniz (Örn: `node scripts/debug/check_auth.mjs`).

---

## 🔒 Güvenlik (RLS ve Tenant İzolasyonu)

Bu bir SaaS projesi olduğu için Supabase tarafında **Row Level Security (RLS)** kullanılarak Tenant bazlı izolasyon sağlanmaktadır. Ek güvenlik kararları ve mimari tasarımlar için [SEC-101 — Tenant Modeli ve Veri Sahipliği](docs/security/SEC-101-tenant-model.md) dokümanını okuyabilirsiniz.

*(Not: Tüm veritabanı "insert, update, delete" işlemleri Next.js sunucusunda veya Supabase rpc (fonksiyon) üzerinden `logActivity` çağrılarak loglanmaktadır.)*

---

## 🚀 Build ve Deploy (Vercel)

Projeyi canlıya almak (Production) için Vercel platformu önerilir.

1. GitHub deponuzu Vercel'e bağlayın.
2. Vercel proje ayarlarından **Environment Variables** bölümüne gidin.
3. `.env.local` dosyanızdaki tüm değerleri Vercel üzerine ekleyin.
4. **Deploy** butonuna tıklayın. Vercel otomatik olarak `npm run build` ve `npm start` komutlarını çalıştıracaktır.

> **Uyarı:** `SUPABASE_SERVICE_ROLE_KEY` değerinin asla `NEXT_PUBLIC_` ön eki ile başlamadığından emin olun, aksi halde admin yetkileriniz istemci tarafında sızabilir!
