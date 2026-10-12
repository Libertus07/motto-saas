# Motto OIP platform logosu

Kullanıcı kararı: 2026-10-11. Marka dalı: `codex/motto-oip-branding`.
Başlangıç commit'i: `5ed84db` (henüz merge edilmemiş OPS-02 dalı üstünde).
Bu dal master'a bağımsız, yalnız marka değişikliği içeren bir PR gibi
sunulmamalı; teslimatta bağımlı commit'ler ayrıca değerlendirilmelidir.

## İlk uygulama (tarihsel ara durum)

- Onaylanan yerel 512x512 PNG, değiştirilmeden
  `public/icons/motto-oip.png` olarak eklendi.
- SHA-256: `7ABDBF882940351F5EAFE6BB6B139B79F86CBC9BA3DD73B18FB3BB852BCD00B2`.
- Giriş ekranının varsayılan logosu ve PWA manifest simgesi yeni yola bağlandı.
- Manifest ve varsayılan logo alternatif metninde platform adı Motto OIP.
- Eski kafe logosu silinmedi. İşletmeye özel logo/RPC seçim akışı değiştirilmedi.
- Manifest gerçek 512x512 boyutunu bildiriyor; aynı dosyayı yanlış biçimde
  192x192 olarak bildiren eski kayıt kaldırıldı.

## İlk uygulamanın doğrulaması (simge paketi öncesi)

Yeni manifest testi değişiklikten önce beklenen marka assertion'ında
başarısız oldu; uygulamadan sonra tam `npm run check` geçti:
format, roadmap, lint, typecheck ve 497 başarılı / 4 mevcut skipped test.
CI'nin sentetik Supabase public değerleriyle production build de başarılı
oldu (35/35 sayfa); canlı kimlik bilgileri kullanılmadı.

Bu ilk uygulama, tamamlanmış favicon/PWA simge paketi veya tüm uygulamanın
isim değişikliği değildir. Sade amblem, gerçek 192px/Apple simgeleri,
küçük boyutta okunabilirlik, mobil/masaüstü tarayıcı ve kurulu PWA güncelleme
kontrolleri sonraki teslimat kapısıdır. Şu aşamada push/merge/deploy yapılmadı.

Graphify yenilemesi `uv trampoline failed to canonicalize script path`
hatasıyla başlayamadı. Mevcut grafik korunuyor. Önceden değiştirilmiş
codebase-memory artefakt çifti üzerine yazılmadı; marka değişikliği için
güncel indeks kanıtı değildir.

Kaynak: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons

## Simge paketi — 2026-10-11

Yerleşik görsel üretim aracıyla tam logodan sade amblem üretildi. Kaynak
`docs/assets/branding/motto-oip-emblem-source.png` olarak korundu; tam logo
değiştirilmedi. Kullanılan görsel istemi: sağa bakan sakallı profil, şimşek
ve altın oval çerçeveyi koru; küçük boyutlar için çizgileri sadeleştir;
tüm yazıları, dış devre çizgilerini, parıltıları ve yıldızı kaldır;
koyu lacivert arka plan, ortalanmış amblem, geniş güvenli boşluk bırak.
Bu kaynak kurulu Sharp ile yalnız boyutlandırılarak PNG olarak dışa aktarıldı.
Yeni bağımlılık eklenmedi, runtime görsel üretimi yapılmıyor.

| Dosya                                 | Boyut / amaç                 |
| ------------------------------------- | ---------------------------- |
| `public/icons/motto-oip.png`          | 512x512, değişmeyen tam logo |
| `public/icons/motto-oip-icon-192.png` | 192x192, PWA                 |
| `public/icons/motto-oip-icon-512.png` | 512x512, PWA                 |
| `src/app/apple-icon.png`              | 180x180, Apple touch icon    |
| `src/app/icon.png`                    | 32x32, tarayıcı simgesi      |

İki manifest simgesinin boyutları PNG başlığından doğrulanıyor. Next.js'in
dosya tabanlı metadata sistemi tarayıcı ve Apple simge bağlantılarını üretiyor.
Maskable uyumluluğu iddia edilmiyor. Eski `src/app/icon.png` Git geçmişinde
korunuyor; müşteri logosu seçimi ve ana checkout değişmedi.

Simge paketi için tam check 499 başarılı / 4 mevcut skipped test ile geçti;
build 36/36 başarılı. Yerel production sunucusunda 320/375/1280px
kontrollerinde scrollWidth viewport genişliğine eşit; varsayılan logolar
yüklendi; icon 32x32 ve apple-touch-icon 180x180 bağlantıları görüldü.
Ekran görüntüleri `output/playwright/oip-login-{320,375,1280}.png` altında
yerel kanıttır, kaynak commit'ine dahil edilmemelidir.

Gerçek cihazda kurulum, mevcut PWA simgesinin güncellenmesi, authenticated
müşteri markası ve tüm uygulama adlarının dönüşümü bu kanıtın kapsamında
değildir. Graphify başlatıcı hatası tekrarlandı; artefaktlar korunuyor.

Resmî simge referansı: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons

## Teslimat bağımlılığı

2026-10-11 GitHub kontrolünde PR #22 hâlâ açıktı. Marka PR'ının hedefi
`codex/ops-02-physical-backup-design` olmalıdır; böylece inceleme farkına
OPS-02 commit'leri dahil olmaz. Bu, master'a bağımsız teslimat değildir.
Mevcut ana CI yalnız master/main hedefli PR'larda çalıştığından bu bağımlı
taslakta ana CI sonucu beklenmez. PR #22 birleştirildikten sonra hedef master
olarak güncellenmeli, net fark ve CI yeniden doğrulanmalıdır. Taslak marka
PR'ı doğrudan OPS-02 dalına birleştirilmemelidir.

Hedef değiştirme referansı:
https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/changing-the-base-branch-of-a-pull-request
