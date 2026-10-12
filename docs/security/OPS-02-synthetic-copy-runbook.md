# OPS-02 B1 — Çevrimdışı sentetik kopyalama

Bu araç yalnız bellekte üretilen test verisi kullanır. AWS veya Supabase'e
bağlanmaz; müşteri verisi, ortam dosyası veya credential okumaz. Nesne içeriği
diske yazılmaz. Sahte hedef içeriği hash'leyip atar; gerçek bir yedek tutmaz.
`COMPLETE`, yalnız **sentetik protokol kanıtı** demektir; geri yüklenebilir,
dayanıklı veya production-ready yedek demek değildir.

## Çalıştırma

Depoların mevcut Node/npm bağımlılıkları yeterlidir; yeni paket gerekmez.

```text
npm run ops:storage-backup:synthetic -- --scenario happy
npm run ops:storage-backup:synthetic -- --scenario mutation
npm run ops:storage-backup:synthetic -- --scenario checksum-mismatch
npm run ops:storage-backup:synthetic -- --scenario interrupted-resume
```

| Senaryo                | Beklenen durum                     | Çıkış |
| ---------------------- | ---------------------------------- | ----- |
| `happy`                | `COMPLETE`                         | 0     |
| `mutation`             | `INCOMPLETE`                       | 1     |
| `checksum-mismatch`    | `INCOMPLETE`                       | 1     |
| `interrupted-resume`   | `COMPLETE`                         | 0     |
| Eksik/geçersiz argüman | `INCOMPLETE` / `INVALID_ARGUMENTS` | 2     |

JSON çıktısı yalnız durum, sabit kod, doğrulanmış tamamlanma toplamları ve üç
kanıt bayrağı içerir. `INCOMPLETE` toplamları sıfırdır; yüklenmiş kısmın envanteri
veya ilerleme ölçümü değildir. Ham path, token, exception veya nested cause
çıktıya alınmaz. Endpoint, dosya yolu ve credential argümanları yoktur.

Her raporda `evidenceLevel: synthetic`, `productionReady: false` ve
`physicalBytesVerifiedInProduction: false` korunur.

## Doğrulanan sözleşmeler

- HMAC kimliği mevcut envanterin bucket + NUL + path kodlamasını kullanır;
  Unicode normalizasyonu veya büyük/küçük harf dönüşümü yapılmaz.
- 64 KiB kaynak parçaları ve tek 5 MiB aktarım tamponu kullanılır. Hedef çağrısı
  bitmeden tampon yeniden kullanılmaz. Ölçülen payload sınırı RSS garantisi değildir;
  nesne listeleri, manifest ve diğer metadata bu ölçümün dışındadır.
- Dosyanın bağımsız SHA-256 değeri, çok parçalı SHA-256 composite değerinden
  ayrıdır. ETag bütünlük kanıtı değildir.
- Kaynak revision/size, iki envanter, belge referans özeti ve içerik hash'leri
  eşleşmeden tamamlanma imzası üretilmez. 90/365 gün `COMPLIANCE`, KMS kimliği ve
  hedef sürümü burada yalnız sahte protokol alanları olarak doğrulanır.
- Yalnız `TRANSIENT`, commit öncesinde en fazla üç deneme ve 100/200 ms üst
  sınırlı jitter ile yeniden denenir. Multipart kesintisi abort edilir; tamamlanmış
  nesne silme yöntemi yoktur. Kayıp commit yanıtı körlemesine yeniden yazılmaz.
- Checkpoint yüklenince kaynak tekrar hash'lenir ve hedefin tam sürüm kanıtı
  doğrulanır. Sahte günlükler atlama yetkisi vermez. Seri hale getirilmiş günlük
  testi crash-durable veya şifreli kalıcılık kanıtı değildir.
- Manifest ve ayrı fixture anahtarıyla doğrulanmış attestation birlikte gerekir.
  Aynı tamamlanmış çalıştırma yeniden doğrulanır; tekrar yayınlanmaz.

## Bilinçli sınırlar ve sonraki kapı

**B2**, gerçek yerel/izole Supabase ve S3 protokol adaptörlerini ayrı planda
doğrulayacaktır. Şifreli kalıcı journal ve özgün path kurtarma eşlemesi, crash
recovery, gerçek IAM/KMS/Object Lock, imza anahtarı yönetimi ve protokol cevap
kaybı uzlaştırması henüz yoktur. Mevcut B1, belirsiz hedef nesnesinde durur.
HMAC fixture anahtarları yalnız yapay örnektir, canlı ortam için kullanılmaz.

Restore Phase C'dir. Canlı envanter, maliyet onayı, gerçek byte kopyalama ve canlı
veriden izole restore ayrı izinlerdir. AWS deploy veya zamanlanmış yedekleme
bu teslimata dahil değildir. OPS-02 bütünü **Devam ediyor** kalır.

## Tekrarlanabilir kalite kontrolleri

```text
node node_modules/vitest/vitest.mjs run scripts/security/storage-backup
npm run check
npm run build
```

Uygulama başlangıç commit'i `70eeecc`; sözleşme `ef695f0`, aktarım `de3309f`,
tamamlanma/resume `4557dd5`. Node 24.11.1 yerel çalışma ortamıdır; CI Node 22
kanıtı ayrıca değerlendirilir. Son kalite kapısı ve bağımsız inceleme kanıtı
teslimat sırasında aşağıya eklenecektir. Hosted CI sonucu varsayılmaz.

## Kaynaklar

- [Onaylı B1 uygulama planı](../superpowers/plans/2026-10-12-ops-02-synthetic-copy-prototype.md)
- [Fiziksel yedekleme tasarımı](../superpowers/specs/2026-10-06-ops-02-physical-storage-backup-design.md)
- [AWS checksum türleri](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html)
  2026-10-13 tarihinde yeniden kontrol edildi: SHA-256 multipart için composite
  kullanılır; bağımsız dosya hash'i ayrı tutulur.
