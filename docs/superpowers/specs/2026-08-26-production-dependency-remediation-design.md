# DEP-02 Production Dependency Remediation Design

**Durum:** Onaylandı<br>
**Tarih:** 2026-08-26<br>
**Roadmap kimliği:** `DEP-02`<br>
**Önceki kanıt:** `docs/security/DEP-01-dependency-vulnerability-audit.md`

## 1. Amaç

DEP-01 denetiminde production ortamında erişilebilir olduğu doğrulanan üç
bağımlılık riskini mevcut kullanıcı akışlarını koruyarak kapatmak:

1. Next.js image optimizer üzerinden erişilebilen `sharp@0.34.5` / libvips
   yolu.
2. `xlsx@0.18.5` içindeki prototype-pollution yolu.
3. `xlsx@0.18.5` içindeki ReDoS yolu.

Bu tasarım kör veya zorlanmış bir paket yükseltmesi önermez. Görsel ve tablo
işleme sınırlarını iki bağımsız, geri alınabilir teslimata ayırır; saldırgan
girdisini riskli sink'ten uzaklaştırır ve paket değişikliklerini davranış,
uyumluluk ve production build kanıtlarına bağlar.

## 2. Kapsam

### 2.1 Kapsam içi

- Kullanıcı ve işletme kontrollü uzak görsellerin Next.js optimizer sınırı.
- `next.config.ts` içindeki uzak görsel allowlist'i ve optimizer kaynak
  sınırları.
- Tedarikçi fişi ile Z raporu XLSX/CSV içe aktarma akışları.
- SheetJS paket kaynağı, sürümü, bütünlük kanıtı ve tekrarlanabilir kurulumu.
- Ortak, tenant-bağlamlı ve kaynak-sınırlı spreadsheet ingestion katmanı.
- Mobil tarayıcı güvenilirliği, güvenli hata sözleşmesi ve gözlemlenebilirlik.
- DEP-01 bulgularının yeniden denetlenmesi ve DEP-02 kapanış kanıtı.

### 2.2 Kapsam dışı

- Supabase Storage Image Transformations kullanımı. Bu özellik Free planda
  mevcut değildir ve bu tasarım ücretli plana bağımlılık oluşturmaz.
- Uygulamanın tüm görsellerini yeni bir CDN veya üçüncü taraf image service'e
  taşıma.
- Spreadsheet düzenleme veya dışa aktarma özelliği ekleme.
- Finansal RPC, veritabanı şeması veya RLS değişikliği.
- Eski `.xls` veya makrolu `.xlsm` biçimlerinin korunması.
- `npm audit fix`, `npm audit fix --force` veya ilgisiz bağımlılık
  yükseltmeleri.

## 3. Tasarım ilkeleri

1. **Erişilebilirliği kaldır:** Saldırgan kontrollü veri riskli API'ye
   ulaştığında production riski doğar; önce bu yolu kapat.
2. **Uyumluluğu kanıtla:** Next.js'in beyan ettiği Sharp aralığının dışındaki
   sürümü override ile zorlama.
3. **Tek güvenlik politikası:** Dosya türü ve kaynak limitlerini tüm
   tüketicilerde aynı modülden uygula.
4. **Tenant sonucu eskitemez:** Organizasyon değişimi bekleyen okuma ve parse
   sonucunu geçersiz kılar.
5. **Ana thread'i koru:** Workbook ayrıştırması sonlandırılabilir bir Web
   Worker içinde çalışır.
6. **Fail closed:** Belirsiz tür, bozuk içerik, formül, makro, harici bağlantı
   ve aşırı kaynak kullanımı reddedilir.
7. **Güvenli geri dönüş:** Arıza halinde eski savunmasız parser veya optimizer
   yolu yeniden etkinleştirilmez.

## 4. Seçilen mimari

DEP-02 iki bağımsız teslimata ayrılır:

- **DEP-02A — Image Pipeline Hardening**
- **DEP-02B — Safe Spreadsheet Ingestion**

İki teslimat ayrı test, commit ve rollback sınırına sahip olur. Ortak kapanış
kapısı yeniden audit, production build, tarayıcı smoke testi ve güncellenmiş
erişilebilirlik sınıflandırmasıdır.

## 5. DEP-02A — Image Pipeline Hardening

### 5.1 Kaynak sınıfları

Her `next/image` tüketicisi üç sınıftan birine atanır:

| Sınıf               | Örnek                                                 | Politika                                |
| ------------------- | ----------------------------------------------------- | --------------------------------------- |
| Güvenilir yerel     | `/public` varlıkları, statik import                   | Normal Next.js optimizasyonu            |
| Güvenilir uzak      | Açıkça onaylı Unsplash yolları                        | Kesin `remotePatterns` ile optimizasyon |
| Kullanıcı kontrollü | İşletme logosu, Supabase Storage belgesi veya görseli | `SafeUserImage`, `unoptimized`          |

Sınıflandırılmamış dinamik URL fail closed davranır ve kullanıcı kontrollü
kabul edilir.

### 5.2 Konfigürasyon sözleşmesi

`next.config.ts` şu kuralları zorunlu kılar:

- `**.supabase.co` wildcard kaldırılır.
- Yalnız doğrulanmış proje hostname'i ve kullanılan Storage pathname'leri
  allowlist'e girer.
- Image optimizer redirect izlemez: `maximumRedirects: 0`.
- Optimize edilen güvenilir kaynak gövdesi yaklaşık `5 MB` ile sınırlanır.
- SVG optimizasyonu açılmaz.
- Kullanılan quality değerleri açık allowlist ile sınırlandırılır.

Bu global sınırlar kullanıcı kontrollü içeriği güvenilir hale getirmez;
`SafeUserImage` ayrımı ayrıca zorunludur.

### 5.3 UI bileşeni

`src/components/ui/SafeUserImage.tsx` yalnız kullanıcı/işletme kontrollü
görseller için kullanılır. Bileşen:

- `unoptimized` davranışını tüketicinin kapatmasına izin vermez.
- Erişilebilir `alt` metni ister.
- Genişlik/yükseklik veya `fill` + `sizes` sözleşmesini zorlar.
- Yükleme hatasında ölçüleri koruyan erişilebilir fallback gösterir.
- Ham URL'yi veya imzalı URL parametrelerini loglamaz.

Bu bileşen genel bir `Image` wrapper'ı değildir. Güvenilir yerel görseller
doğrudan `next/image` kullanmaya devam eder.

### 5.4 Sharp sürüm kararı

Mevcut `next@16.2.12`, optional dependency olarak `sharp: ^0.34.5` beyan eder.
SemVer sıfır-major kuralları nedeniyle bu aralık `0.35.x` sürümünü kapsamaz.
Bu nedenle DEP-02A:

1. `sharp@0.35.x` override etmez.
2. Kullanıcı kontrollü girdinin optimizer'a erişimini kaldırarak mevcut riski
   production yolundan çıkarır.
3. Next.js'in `0.35.x` desteği doğrulandığında ayrı compatibility upgrade
   görevi açar.
4. O yükseltmede Windows geliştirme, Linux/Vercel build, image response ve
   output-file tracing doğrulaması ister.

## 6. DEP-02B — Safe Spreadsheet Ingestion

### 6.1 Desteklenen biçimler

| Biçim                    | Durum       | Gerekçe                                                |
| ------------------------ | ----------- | ------------------------------------------------------ |
| `.xlsx`                  | Desteklenir | Mevcut ana iş akışı ve güncel açık XML workbook biçimi |
| `.csv`                   | Desteklenir | Basit ve taşınabilir güvenli alternatif                |
| `.xls`                   | Reddedilir  | Legacy binary parser yüzeyi ve gereksiz bakım maliyeti |
| `.xlsm`                  | Reddedilir  | Makro taşıma riski                                     |
| Parola korumalı workbook | Reddedilir  | İçerik ve limit doğrulaması güvenilir yapılamaz        |

Uzantı tek başına yeterli değildir. MIME, magic byte ve içerik sözleşmesi
birlikte doğrulanır.

### 6.2 Paket tedariki

Eski public npm `xlsx@0.18.5` kaldırılır. Resmi SheetJS CE `0.20.3` tarball'ı:

1. Resmi SheetJS CDN kaynağından bir kez indirilir.
2. SHA-256 özeti iki bağımsız okumada doğrulanır ve güvenlik raporuna yazılır.
3. `vendor/xlsx-0.20.3.tgz` olarak Git'te saklanır.
4. `package.json` içinde `file:vendor/xlsx-0.20.3.tgz` referansıyla kullanılır.
5. `package-lock.json` bütünlüğü temiz kurulumla doğrulanır.

Bu seçim CDN erişilemezken build'i korur ve registry'deki güncelliğini yitirmiş
pakete geri dönülmesini önler.

### 6.3 Modül sınırları

```text
src/features/spreadsheets/
├── spreadsheet-policy.ts
├── spreadsheet-types.ts
├── spreadsheet-parser.worker.ts
├── parse-spreadsheet.ts
├── normalize-spreadsheet.ts
└── __tests__/
```

- `spreadsheet-policy.ts`: Türler ve tüm kaynak limitlerinin tek kaynağıdır.
- `spreadsheet-parser.worker.ts`: Yalnız byte dizisini parse eder; React,
  Supabase ve tenant context bilmez.
- `parse-spreadsheet.ts`: Worker yaşam döngüsü, timeout, termination ve sonuç
  sözleşmesini yönetir.
- `normalize-spreadsheet.ts`: Hücreleri prototype-safe nötr satırlara çevirir;
  domain alan adlarını yorumlamaz.
- Tedarikçi ve Z raporu feature'ları nötr sonucu kendi DTO'larına ayrı adapter
  ile dönüştürür.

Ortak modül finansal kayıt yapmaz. Kullanıcının mevcut inceleme adımı ve atomik
RPC akışları korunur.

### 6.4 Veri akışı

```text
Dosya seçimi
  -> uzantı + MIME + magic-byte doğrulaması
  -> aktif organization ID damgası
  -> ArrayBuffer aktarımı
  -> Web Worker parse
  -> kaynak limiti ve içerik politikası
  -> prototype-safe nötr tablo
  -> feature adapter + Zod doğrulaması
  -> kullanıcı incelemesi
  -> mevcut tenant-scoped atomik kayıt
```

Organizasyon değişirse seçili dosya, worker isteği ve sonuç generation kimliği
geçersiz olur. Eski worker sonucu UI state'e veya kayıt payload'ına giremez.

### 6.5 Kaynak limitleri

| Sınır           |                                      `.xlsx` |          `.csv` |
| --------------- | -------------------------------------------: | --------------: |
| Dosya boyutu    |                                         3 MB |            1 MB |
| Workbook/sayfa  | En fazla 5; yalnız ilk görünür sayfa işlenir |               1 |
| Satır           |                                        5.000 |           5.000 |
| Sütun           |                                          100 |             100 |
| Toplam hücre    |                                      100.000 |         100.000 |
| Tek hücre metni |                              10.000 karakter | 10.000 karakter |
| Worker süresi   |                                     8 saniye |        5 saniye |

Limit aşımı kısmi sonuç döndürmez. Worker sonlandırılır, geçici referanslar
temizlenir ve kullanıcı güvenli hata mesajı alır.

### 6.6 İçerik politikası

- Yalnız ilk görünür worksheet domain adapter'a iletilir.
- Formül içeren hücreler, harici workbook bağlantıları, makro işaretleri ve
  desteklenmeyen koruma özellikleri reddedilir.
- `__proto__`, `prototype` ve `constructor` gibi anahtarlar oluşturulmaz veya
  kopyalanmaz.
- Parser sonucu null-prototype veya allowlist tabanlı yapıya normalize edilir.
- Hücre formülleri çalıştırılmaz; cached formula sonucu güvenilir veri sayılmaz.
- Ham workbook, hücre içeriği ve kullanıcı dosya adı telemetry/log'a yazılmaz.

## 7. Hata sözleşmesi

Kullanıcıya teknik ayrıntı sızdırmayan Türkçe hata kategorileri gösterilir:

- `UNSUPPORTED_TYPE`: “Bu dosya türü desteklenmiyor. XLSX veya CSV seçin.”
- `LIMIT_EXCEEDED`: “Dosya güvenli işlem sınırlarını aşıyor.”
- `INVALID_WORKBOOK`: “Dosya okunamadı veya beklenen tablo yapısına sahip
  değil.”
- `UNSAFE_CONTENT`: “Dosya desteklenmeyen veya güvenli olmayan içerik içeriyor.”
- `ORGANIZATION_CHANGED`: “İşletme değiştiği için dosya işlemi iptal edildi.”
- `TIMEOUT`: “Dosyanın işlenmesi güvenli süre sınırını aştı.”

Teknik ayrıntı yalnız `devError` üzerinden hata kodu, feature adı ve aşama ile
loglanabilir. Ham exception mesajı, URL, imzalı token, dosya adı, dosya içeriği,
hücre değeri veya tenant verisi loglanmaz.

## 8. Test stratejisi

Her davranış TDD ile uygulanır. Üretim değişikliğinden önce aşağıdaki RED
kanıtları oluşturulur:

1. `.xls`, `.xlsm`, yanlış MIME ve sahte uzantı reddi.
2. Boş, bozuk ve parola korumalı workbook reddi.
3. Dosya, sheet, satır, sütun, hücre, metin ve süre limitleri.
4. Formül, harici bağlantı, makro ve prototype-key reddi.
5. Timeout sonrası gerçek worker termination ve stale callback engeli.
6. Organizasyon değişiminde eski parse sonucunun yayımlanmaması.
7. Hata veya başarıdan sonra aynı dosyanın yeniden seçilebilmesi.
8. Tedarikçi ve Z raporu adapter'larının mevcut DTO davranışı.
9. Kullanıcı kontrollü görsellerde optimizer URL'si oluşmaması.
10. Güvenilir yerel görsellerde mevcut `next/image` davranışının korunması.

Fixture seti küçük, anonimleştirilmiş geçerli XLSX/CSV dosyaları ile kontrollü
kötü niyetli dosyalardan oluşur. Binary fixture kaynağı, amacı ve SHA-256 özeti
test dokümantasyonunda kayıtlı olur.

## 9. Kalite ve kabul kapıları

Her teslimat için:

- Hedefli Vitest testleri.
- `npm run format:check`.
- `npm run roadmap:check`.
- `npm run lint`.
- `npm run typecheck`.
- Tam `npm run test`.
- Güvenli yerel environment ile production `npm run build`.
- Dar mobil ve masaüstü tarayıcı smoke testi.
- `npm audit --json` ve `npm audit --omit=dev --json` sonuçlarının ayrı kaydı.
- DEP-01'deki üç exact path için yeniden erişilebilirlik incelemesi.
- `graphify update .` ve codebase-memory refresh.
- Manifest dışı veya ilgisiz diff bulunmaması.

DEP-02 yalnız iki XLSX advisory yolu artık kurulu değilse ve Sharp yolu
saldırgan kontrollü production girdisine erişemiyorsa `Yerelde tamam` olabilir.
Push, merge, deploy ve production doğrulaması ayrıca raporlanır.

## 10. Teslimat sırası

1. Mevcut görsel ve spreadsheet davranışının karakterizasyon testleri.
2. DEP-02A image source sınıflandırması, `SafeUserImage` ve config hardening.
3. Vendored SheetJS paketi, bütünlük kanıtı ve ortak worker parser.
4. Tedarikçi fişi adapter'ı ve geçişi.
5. Z raporu adapter'ı ve geçişi.
6. Tam kalite kapıları, audit yenilemesi ve erişilebilirlik incelemesi.
7. Roadmap, Graphify, codebase-memory ve kapanış kanıtı.

Her sıra ayrı, cohesive commit sınırı olarak uygulanabilir. İlgisiz bağımlılık
güncellemeleri bu zincire eklenmez.

## 11. Geri dönüş ve operasyon

- DEP-02A sorununda kullanıcı kontrollü görseller güvenli `unoptimized` veya
  fallback görünümünde kalır; eski optimizer yolu açılmaz.
- Spreadsheet parser sorununda XLSX/CSV yükleme geçici olarak devre dışı
  bırakılır; görsel, PDF, XML/JSON ve manuel giriş yolları açık kalır.
- Eski `xlsx@0.18.5` hiçbir rollback paketinde yeniden etkinleştirilmez.
- Parser başarısızlığı finansal mutation başlatmaz ve geçici belge yüklemez.
- Rollback paket ve lockfile'ı birlikte geri alır; yarım dependency state kabul
  edilmez.

## 12. İzleme ve takip

- Güvenli, düşük kardinaliteli hata kodları feature ve aşama bazında sayılabilir.
- Dosya içeriği, isimleri ve tenant kimliği metrik etiketi değildir.
- `INVALID_WORKBOOK`, `LIMIT_EXCEEDED` ve `TIMEOUT` artışı rollout geri alma
  değerlendirmesi başlatır.
- Next.js'in Sharp `0.35.x` uyumluluğu ayrı takip girdisidir; otomatik major/minor
  override yapılmaz.
- SheetJS sürüm ve advisory kaynakları her dependency audit döngüsünde yeniden
  doğrulanır.

## 13. Karar özeti

- `.xls` desteği kaldırılır; `.xlsx` ve `.csv` korunur.
- SheetJS CE `0.20.3` resmi tarball'ı hash ile vendored kullanılır.
- Spreadsheet parsing kaynak-sınırlı ve sonlandırılabilir Web Worker'a taşınır.
- Ortak parser domain bağımsızdır; tedarikçi ve Z raporu ayrı adapter kullanır.
- Kullanıcı kontrollü görseller Next.js/Sharp optimizer'ını kullanmaz.
- Sharp `0.35.x`, mevcut Next.js sözleşmesine zorla enjekte edilmez.
- Güvenli rollback eski savunmasız yola dönmez.

## 14. Kaynaklar

- [Next.js Image Optimization](https://nextjs.org/docs/app/getting-started/images)
- [Next.js production Sharp guidance](https://nextjs.org/docs/messages/sharp-missing-in-production)
- [Vercel Image Optimization](https://vercel.com/docs/image-optimization)
- [SheetJS framework and bundler installation](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/)
- [SheetJS CVE-2023-30533 advisory](https://cdn.sheetjs.com/advisories/CVE-2023-30533)
- [SheetJS ReDoS advisory](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9)
- [Sharp 0.35.0 changelog](https://github.com/lovell/sharp/blob/main/docs/src/content/docs/changelog/v0.35.0.md)
