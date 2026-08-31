# Next.js 16.3.3 ve Sharp 0.35.4 Uyumluluk Yükseltmesi Tasarımı

**Durum:** Onaylanmış tasarım yönü; uygulama planı bekleniyor<br>
**Tarih:** 2026-08-31<br>
**Sahip:** `DEP-02` production dependency remediation<br>
**Önkoşul:** DEP-02A image pipeline hardening ve DEP-02B safe spreadsheet
ingestion yerelde tamam

## 1. Amaç

Motto SaaS'ı `next@16.2.12` ve geçişli `sharp@0.34.5` sözleşmesinden,
framework'ün doğrudan desteklediği `next@16.3.3` ve doğal olarak çözülen
`sharp@0.35.4` sözleşmesine
kontrollü biçimde taşımak.

Yükseltme şu iki sonucu birlikte sağlamalıdır:

1. `GHSA-f88m-g3jw-g9cj` için `<0.35.0` Sharp node'u kurulu dependency
   ağacından çıkarılmalıdır.
2. Mevcut `SafeUserImage` ve trusted-image optimizer politikaları korunmalı;
   paket yükseltmesi savunma katmanlarını gevşetmemelidir.

Bu çalışma paket sürümünü değiştirmekten ibaret değildir. Next image runtime,
PWA build entegrasyonu, native Sharp binary çözümlemesi ve deployment runtime
uyumluluğu aynı teslimat sınırında kanıtlanır.

## 2. Mevcut doğrulanmış durum

| Sınır                      | Mevcut durum                                                                  |
| -------------------------- | ----------------------------------------------------------------------------- |
| Framework                  | `next@16.2.12`                                                                |
| Framework Sharp sözleşmesi | optional dependency `sharp: ^0.34.5`                                          |
| Kurulu Sharp               | `sharp@0.34.5`                                                                |
| React                      | `react@19.2.4`, `react-dom@19.2.4`                                            |
| PWA                        | `@ducanh2912/next-pwa@10.2.9`; peer sınırı `next >=14`, `webpack >=5.9`       |
| Lint entegrasyonu          | `eslint-config-next@16.2.9`; framework ile tam patch hizasında değil          |
| CI runtime                 | GitHub Actions Node `22.x`                                                    |
| Yerel doğrulama runtime'ı  | Node `24.11.1`                                                                |
| Production runtime         | Repository içinde sabitlenmemiş; rollout öncesinde ayrıca doğrulanmalı        |
| User image sınırı          | `SafeUserImage`, zorunlu `unoptimized`, erişilebilir ve ölçü koruyan fallback |
| Trusted optimizer sınırı   | Exact Supabase/Unsplash allowlist; redirect `0`; gövde `5 MB`; SVG kapalı     |

Kullanıcı kontrollü görseller Sharp optimizer'a gönderilmediği için DEP-02A
production erişilebilirliğini daraltmıştır. Buna rağmen savunmasız package node'u
lockfile'da kaldığından dependency advisory kapanmış değildir.

## 3. Kaynak ve sürüm kararı

### 3.1 Seçilen hedef

- `next`: exact `16.3.3`
- `eslint-config-next`: exact `16.3.3`
- `sharp`: doğrudan dependency veya override olarak eklenmez; Next'in
  `sharp: ^0.35.3` optional dependency sözleşmesinden çözülür
- React ve React DOM: bu çalışma kapsamında değiştirilmez
- `@ducanh2912/next-pwa`: ancak gerçek bir uyumsuzluk kanıtlanırsa ayrı kararla
  değiştirilir; proaktif veya transitif toplu upgrade yapılmaz

Next 16.3.3 kaynak paket manifesti Node `>=20.9.0` ve `sharp: ^0.35.3` beyan
eder. Sharp 0.35 serisi de Node `>=20.9.0` gerektirir. Mevcut CI Node 22 bu
ortak minimumu karşılar.

26 Ağustos 2026 tarihli resmi [Sharp v0.35.4 yayın notları](https://github.com/lovell/sharp/releases/tag/v0.35.4)
resize ve composite koordinat sınırlarını ekler ve `sharp-libvips` 1.3.3 platform
paketleriyle yayımlanır. Resmi [Sharp 0.35.4 npm paket kaydı](https://www.npmjs.com/package/sharp/v/0.35.4)
Node `>=20.9.0` sözleşmesini taşır. Bu sürüm, advisory'nin etkilediği `<0.35.0`
aralığının dışındadır. Bu nedenle karar, Next'in `^0.35.3` aralığını değiştirmeden
npm'in 0.35.4 doğal çözümünü kabul eder.

### 3.2 Reddedilen yaklaşımlar

#### Mevcut Next üzerinde Sharp override

Reddedildi. `next@16.2.12` tarafından beyan edilmeyen bir Sharp major-minor
aralığını zorlar; runtime/image optimizer uyumluluğunu package manager dışına
taşır ve framework desteği olmayan bir kombinasyon üretir.

#### Yalnız erişilebilirlik mitigasyonuyla sürümde kalmak

Geçici savunma olarak güvenlidir ancak dependency advisory'sini ve gelecekte
yeni optimizer consumer'ı eklenmesi riskini kalıcı olarak kapatmaz.

#### `next@latest` veya toplu dependency upgrade

Reddedildi. Değişken hedef, yeniden üretilebilirliği ve exact-scope incelemeyi
bozar. React, Supabase, PWA veya ilgisiz paket değişiklikleri bu güvenlik
teslimatına karıştırılmaz.

## 4. Değişiklik sınırı

Beklenen production değişiklikleri:

1. `package.json` içinde yalnız `next` ve `eslint-config-next` exact sürümleri.
2. `package-lock.json` içinde bu iki paket ve zorunlu/geçişli platform
   dependency'lerinin deterministik çözümü.
3. Yalnız Next 16.3.3 ile kanıtlanmış bir kaynak uyumsuzluğu varsa en küçük
   uyumluluk düzeltmesi.
4. Sürüm ve image-runtime sözleşmesini koruyan odaklı testler.
5. DEP-02 audit raporu ve merkezi roadmap kanıtı.
6. Araçla üretilen Graphify/codebase-memory artifact yenilemesi.

Bu kapsamda değiştirilmeyecek alanlar:

- `SafeUserImage` güvenlik davranışının gevşetilmesi;
- Supabase schema, migration, RPC veya RLS;
- spreadsheet parser ve vendored SheetJS artifact'ı;
- finansal write/persistence akışları;
- kullanıcıya açık ürün davranışı veya tasarım;
- canlı environment, production veri veya secret yönetimi.

## 5. Güvenlik değişmezleri

1. User/tenant-controlled kaynaklar her zaman `SafeUserImage` üzerinden
   `unoptimized` render edilir.
2. Caller, `unoptimized` veya ham `onError` prop'u ile sınırı bypass edemez.
3. `next.config.ts` exact remote allowlist, `maximumRedirects: 0`,
   `maximumResponseBody: 5_000_000`, `qualities: [75]` ve
   `dangerouslyAllowSVG: false` değerlerini korur.
4. Signed URL, query string, organizasyon kimliği veya ham native image hatası
   loglanmaz.
5. Lockfile'da `sharp@0.34.x` ve `GHSA-f88m-g3jw-g9cj` anahtarlı kurulu node
   kalmaz.
6. Direct `sharp` dependency, `overrides`, `resolutions`, `--force` veya
   `--legacy-peer-deps` kullanılmaz.
7. Güvenlik sınırı arızasında fallback gösterilir; eski optimizer bypass yolu
   yeniden açılmaz.

## 6. Runtime ve platform uyumluluğu

### 6.1 Node sözleşmesi

- Zorunlu taban: Node `>=20.9.0`.
- CI kanonik doğrulama runtime'ı: Node `22.x`.
- Windows geliştirici doğrulaması: mevcut Node 24 üzerinde ek kanıt.
- Production/preview runtime: rollout öncesinde en az Node 20.9 olduğu deployment
  metadata'sından doğrulanır; tahmin edilmez.

Bu çalışma ilk aşamada `package.json#engines` eklemez. Repository CI sözleşmesi
zaten Node 22'yi sabitler; deployment runtime'ını değiştirmek ayrı operasyonel
karardır. Preview doğrulaması farklı bir runtime gösterirse rollout durur ve
runtime pinleme ayrı, açık bir değişiklik olarak tasarlanır.

### 6.2 Native binary matrisi

Lockfile ve temiz `npm ci` şu yüzeylerde doğrulanır:

- Windows x64 geliştirme;
- GitHub Actions Ubuntu/Node 22;
- izin verildiğinde Vercel preview/build runtime'ı.

Her yüzeyde `sharp` modülü yüklenebilmeli ve Next production build tamamlanmalı;
platform package'ları elle seçilmez veya lockfile dışı indirilmez.

### 6.3 PWA uyumluluğu

`@ducanh2912/next-pwa` geniş peer aralığı nedeniyle otomatik olarak uyumlu kabul
edilmez. Production build aşağıdakileri ayrıca kanıtlar:

- `public/sw.js` üretimi;
- manifest ve service-worker route'larının korunması;
- protected navigation'ın eski bundle/cache yüzünden bozulmaması;
- PWA plugin'inin Next config image politikasını değiştirmemesi.

## 7. Değişiklik ve veri akışı

```text
package.json exact versions
          |
          v
npm resolution -> package-lock.json
          |
          +--> next@16.3.3
          |       |
          |       +--> sharp: ^0.35.3 optional contract -> sharp@0.35.4
          |
          +--> eslint-config-next@16.3.3
          |
          v
static contracts -> unit tests -> full quality gate -> production build
          |
          v
main-agent browser verification -> audit evidence -> delivery gate
```

Trusted local/approved remote images normal `next/image` optimizer akışını
korur. User-controlled images `SafeUserImage` ile `/_next/image` endpoint'ine
hiç gitmez. Yükseltme bu sınıflandırmayı değiştirmez.

## 8. Test ve kanıt stratejisi

### 8.1 Dependency sözleşmesi

- `npm ls next sharp eslint-config-next --all`
- `npm explain sharp`
- package-lock'ta tek `next@16.3.3` ve tek `sharp@0.35.4` doğrulaması
- `sharp@0.34.x`, direct Sharp dependency ve override yokluğu
- `npm ci` ile temiz kurulum kanıtı

### 8.2 Statik ve birim testleri

- Mevcut `SafeUserImage` testleri değişmeden geçer.
- Image boundary enforcement ve `imageConfig` exact policy testleri geçer.
- Gerekirse Next/PWA config export'u için behavior-oriented bir regression testi
  eklenir; source-text snapshot eklenmez.
- `next/og` veya `ImageResponse` production kullanımı olmadığı graph ve kaynak
  taramasıyla doğrulanır. Sonradan eklenirse image optimizer sonrası aynı process
  içinde ayrıca regression testi zorunlu olur.

### 8.3 Tam yerel kapı

```text
npm run format:check
npm run roadmap:check
npm run lint
npm run typecheck
npm run test
npm run build
```

Build yalnız process-local sentetik public Supabase değerleriyle çalışır;
`.env*` dosyası okunmaz, değiştirilmez veya commitlenmez. Generated
`next-env.d.ts` drift'i ayrı kullanıcı değişikliği yoksa geri alınır.

### 8.4 Tarayıcı matrisi

Tarayıcı doğrulamasını ana ajan yapar. En az 1440x900 ve 390x844 viewport'larda:

- login branding logosu;
- sidebar işletme logosu;
- ayarlar logo preview/fallback;
- finansal belge image preview;
- tedarikçi, yatırım ve Z-report yerel preview;
- activity-history image preview;
- güvenilir yerel image ve onaylı Unsplash optimizer isteği;
- service-worker kayıt/yenileme ve protected navigation.

Network kanıtı query string veya signed token kaydetmeden yalnız URL sınıfını
raporlar:

- user-controlled kaynak için `/_next/image` isteği: `0`;
- trusted optimizer fixture için beklenen `/_next/image` isteği: en az `1`;
- horizontal overflow ve erişilemeyen aksiyon: `0`.

### 8.5 Audit

Network onayıyla iki tarama çalışır:

- `npm audit --json`
- `npm audit --omit=dev --json`

Ham rapor yalnız git-ignored görev workspace'inde tutulur. Kapanış için toplam
audit sayısının sıfır olması gerekmez; `sharp` ve `GHSA-f88m-g3jw-g9cj`
bulgusunun iki kapsamda da yokluğu, kalan bulguların ise ayrı sınıflandırılması
gerekir.

## 9. Teslimat aşamaları

1. **Sözleşme testleri:** Beklenen Next/Sharp/ESLint kimliğini RED olarak
   tanımlar.
2. **Exact dependency update:** Yalnız onaylı iki direct dependency ve lockfile.
3. **Uyumluluk düzeltmeleri:** Yalnız gerçek test/build hatasıyla kanıtlanan en
   küçük kaynak değişiklikleri.
4. **Yerel kalite ve native runtime:** Windows, CI-benzeri Node 22 ve production
   build.
5. **Ana-ajan browser doğrulaması:** Desktop/mobile, image request sınıfları ve
   PWA davranışı.
6. **Audit ve mimari kanıt:** npm audit, Graphify, codebase-memory ve durable
   docs.
7. **Teslimat kapısı:** Push/PR/CI/preview ayrı yetkiyle; production rollout daha
   sonra ayrı onayla.

Her aşama cohesive commit veya açık review sınırına sahip olur. Paket değişikliği
ile davranış düzeltmesi mümkün olduğunda ayrı commitlerde tutulur.

## 10. Hata yönetimi ve durdurma koşulları

Aşağıdaki durumlardan biri oluşursa upgrade zorlanmaz:

- Next 16.3.3 installed contract'ı `sharp@0.35.4` doğal çözümünü üretmez;
- npm peer çözümü `--force` veya `--legacy-peer-deps` ister;
- PWA service worker üretimi veya protected navigation bozulur;
- trusted image optimizer ya da user-image bypass invariant'ı bozulur;
- Windows veya Linux native Sharp yüklemesi başarısız olur;
- full quality/build kapısı tekrar edilebilir biçimde başarısız olur;
- production runtime Node minimumu doğrulanamaz.

Bu durumda çalışma mevcut güvenli `SafeUserImage` sınırında kalır; eski
user-image optimizer erişimi açılmaz. Sorun ayrı compatibility finding olarak
kaydedilir.

## 11. Geri dönüş

Yerel veya preview regresyonunda:

1. Yalnız dependency/compatibility commit zinciri geri alınır.
2. `SafeUserImage`, `imageConfig` ve spreadsheet hardening korunur.
3. `package.json` ve `package-lock.json` birlikte eski doğrulanmış kimliğe döner.
4. Eski lockfile ile `npm ci`, odaklı image testleri ve production build tekrar
   çalıştırılır.
5. Production rollback ancak ayrı rollout planı, gözlem kanıtı ve kullanıcı
   onayıyla yapılır.

Lockfile tek başına veya manifestsiz geri alınmaz. Canlı deployment üzerinde
manuel node_modules müdahalesi yapılmaz.

## 12. Kabul kriterleri

Yerel implementation ancak aşağıdaki koşulların tümü sağlandığında tamamlanır:

1. Exact `next@16.3.3` ve `eslint-config-next@16.3.3` kurulu.
2. Next tarafından doğal olarak çözülen tek `sharp@0.35.4` node'u var; `0.34.x` yok.
3. Direct Sharp dependency, override ve force flag yok.
4. React, Supabase, SheetJS ve ilgisiz direct dependency sürümleri değişmemiş.
5. SafeUserImage ve exact image policy testleri geçmiş.
6. Format, roadmap, lint, typecheck ve tam test suite geçmiş.
7. Windows ve CI-benzeri Node 22 production build geçmiş; PWA artifact üretilmiş.
8. Ana-ajan desktop/mobile browser matrisi geçmiş.
9. User-controlled image optimizer request sayısı sıfır; trusted fixture
   optimizer davranışı korunmuş.
10. Full ve production audit'te Sharp advisory yok.
11. Graphify ve codebase-memory güncel; generated artifact scope incelenmiş.
12. Worktree'de secret, `.env*`, raw audit, müşteri verisi veya ilgisiz diff yok.

Bu noktada DEP-02 **Yerelde tamam** olabilir. `Tamamlandı` statüsü için ayrıca
push, PR/CI, preview ve onaylı production rollout kanıtı gerekir.

## 13. Kaynaklar

- Next.js `v16.3.3` package manifesti:
  <https://raw.githubusercontent.com/vercel/next.js/v16.3.3/packages/next/package.json>
- GitHub reviewed Sharp advisory `GHSA-f88m-g3jw-g9cj`:
  <https://github.com/advisories/GHSA-f88m-g3jw-g9cj>
- Sharp `v0.35.0` breaking-change kaydı:
  <https://github.com/lovell/sharp/blob/main/docs/src/content/docs/changelog/v0.35.0.md>
- Mevcut DEP-02 tasarımı:
  `docs/superpowers/specs/2026-08-26-production-dependency-remediation-design.md`
