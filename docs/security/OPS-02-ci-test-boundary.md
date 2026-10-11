# OPS-02 CI test paket sınırı

Doğrulama tarihi: 2026-10-11. İncelenen temel: `12c669f`.

## Bulgu ve düzeltme

[PR #22](https://github.com/Libertus07/motto-saas/pull/22) için
[38095617649 numaralı CI çalıştırmasının](https://github.com/Libertus07/motto-saas/actions/runs/38095617649)
`lint-and-test` işi test toplama aşamasında başarısız oldu. Kök paketin
`vitest run` komutu `infra/ops02-backup/test/` dosyalarını da topladı. Bu iş
yalnız kök lockfile ile kurulum yaptığından dört CDK test dosyası
`aws-cdk-lib` modülünü yükleyemedi. Aynı commit'in bağımsız
[altyapı CI çalıştırması](https://github.com/Libertus07/motto-saas/actions/runs/38095617698)
başarılıydı; veritabanı migration/pgTAP işi de geçti. Kök build işi önceki
işin başarısızlığı nedeniyle atlandı.

`vitest.config.mts`, varsayılan hariç tutmaları koruyarak bağımsız altyapı
paketini ve iç içe yerel worktree'leri kök test kapsamından ayırır. Uygulama
ve script testleri korunur. Yeni production veya development bağımlılığı
eklenmedi; altyapı workflow'u, testleri ve assertion'ları değiştirilmedi.

`scripts/ci/test-discovery.test.ts`, kurulu Vitest'in gerçek test keşfini
ayrı süreçte çalıştırır; testleri özyinelemeli yürütmez. Uygulama ve CI
sözleşme testlerinin bulunmasını, altyapı dosyalarının kökten
toplanmamasını doğrular. Yapılandırma kaldırılırsa test yeniden başarısız olur.
Vitest Node API deneysel olduğundan sürüm yükseltmelerinde bu keşif sözleşmesi
tekrar doğrulanmalıdır.

## Yerel kanıt

- Düzeltmeden önce regresyon testi beş altyapı dosyasını bularak beklenen
  assertion'da başarısız oldu; düzeltmeden sonra geçti.
- Regresyon ve mevcut altyapı workflow sözleşmesi: `5/5` başarılı.
- Kök `npm run check`: format, 19 görevli roadmap, lint, typecheck ve
  `496` başarılı / mevcut `4` skipped test. Önceki `583` kök test sayısı
  altyapı paketindeki `88` testi de içeriyordu; yeni sayı `583 - 88 + 1`.
- Ayrı altyapı kontrolünün ilk yerel tekrarı iki `beforeAll` hazırlığında
  10 saniyelik timeout verdi: `audit-monitoring` ve `foundation-stack`.
  Sonuç `73` başarılı / `15` skipped; bu çalıştırma başarılı sayılmaz.
  Timeout sınırları gevşetilmedi. Nedeni henüz kesinleştirilmedi.
- İkinci varsayılan altyapı tekrarı `foundation-stack` hazırlığında aynı
  timeout ile `82` başarılı / `6` skipped verdi. Aynı testlerin
  `npm run test --prefix infra/ops02-backup -- --maxWorkers=1` çalıştırması
  `88/88` geçti; süre sınırları ve assertion'lar değiştirilmedi. Bu sonuç
  eşzamanlılık/yük etkisini destekler, tek başına kesin neden kanıtı değildir.
  Varsayılan yerel paralel çalışma kararlılığı ayrı açık madde olarak kalır.
- İlk `npm run build` denemesi gerekli public ortam değerleri olmadığı için
  prerender aşamasında başarısız oldu; canlı anahtar temin edilmedi.
- CI ile aynı `NEXT_PUBLIC_SUPABASE_URL=https://ci-placeholder.supabase.co`
  ve `NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-build-placeholder` değerleriyle tekrar
  build başarılı oldu (`35/35`). Bunlar sentetik değerlerdir, canlı erişim
  anahtarı değildir. Build'in ürettiği ilgisiz `next-env.d.ts` farkı kaldırıldı.
- Bağımsız salt okunur kod incelemesinde bu iki dosyalık düzeltme için
  Critical/Important/Minor bulgu raporlanmadı; altyapı timeout'larının
  nedeni ve yeni hosted CI başarısı bu incelemenin kapsamı dışında kaldı.

## Açık teslimat kapıları

### 2026-10-11 bağımsız tekrar doğrulama

Mevcut kaydedilmemiş düzeltme korunarak Node `24.11.1` ile yeniden kontrol
edildi. Kök `npm run check` başarılı: format, roadmap (19 görev), lint,
typecheck ve `496` başarılı / `4` skipped test. Ardından başka bir kalite
kontrolüyle eşzamanlı çalıştırılmadan, varsayılan
`npm run test --prefix infra/ops02-backup` komutu `5` dosyada `88/88` geçti
(14,92 saniye). Worker veya timeout ayarları değiştirilmedi.

Bu tekrar önceki timeout'ları yeniden üretmedi; tek başarılı tekrar
aralıklı kararlılık riskini kesin olarak kapatmaz. İlk sandbox denemesi
test dosyalarında `realpath EPERM` nedeniyle testleri yükleyemedi; yukarıdaki
sonuçlar izinli sandbox dışı çalıştırmalara aittir. Bu turda build ve hosted
CI yeniden çalıştırılmadı; önceki build kanıtı tarihsel kayıt olarak kalır.

Yeni commit'in GitHub kontrolleri ve varsayılan yerel paralel altyapı
çalıştırmasının kararlılığı doğrulanmadan uçtan uca kapanış iddia edilmez.

`graphify update .` başlatıcısı `uv trampoline failed to canonicalize script
path` hatası verdi. Mevcut grafik dosyaları korunur; önceki shrink-guard
nedeniyle açık kalan Graphify güncellik sorunu kapanmış değildir.

Bu düzeltme merge, AWS deploy, production envanteri, nesne kopyası veya
restore yetkisi vermez. DEP-02 ertelemesi ve ana checkout'taki kullanıcı
değişiklikleri korunur.

## Resmî başvuru

- [Vitest 1.6 yapılandırma ve varsayılanları genişletme](https://v1.vitest.dev/config/file)
- [Vitest 1.6 Node API ve sürüm uyumluluğu uyarısı](https://v1.vitest.dev/advanced/api)
