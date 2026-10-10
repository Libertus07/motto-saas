# OPS-02 — Storage fiziksel yedekleme ve kurtarma tasarımı

**Durum:** Devam ediyor. Salt okunur envanter aracı yerel Supabase üzerinde doğrulandı; production envanteri, fiziksel yedek ve geri yükleme yapılmadı. Bu belge production işlem yetkisi vermez.

**Onaylı hedef mimari:** Ayrı AWS hesabı, S3 Versioning, Object Lock
`COMPLIANCE`, müşteri yönetimli KMS anahtarı, ölçülebilir RPO/RTO ve izole
restore modelini tanımlayan ayrıntılı tasarım için
[2026-10-06 OPS-02 fiziksel Storage yedekleme ve kurtarma tasarımına](../superpowers/specs/2026-10-06-ops-02-physical-storage-backup-design.md)
bakın. Bu onay, AWS kaynağı oluşturma veya production verisi okuma/yazma yetkisi
vermez.

## Problem ve kapsam

Mevcut [production veritabanı yedeği](production-database-deployment.md) `storage.objects` kayıtlarını içerebilir; nesnelerin fiziksel baytlarını içermez. Supabase de veritabanı yedeğinin Storage nesnelerini geri getirmediğini [belirtir](https://supabase.com/docs/guides/platform/backups). Bu nedenle veritabanı yedeği ile Storage yedeği ayrı ama eşleştirilebilir kanıt paketleri olmalıdır.

Önce salt okunur envanterle production projesindeki **bütün** bucket'ların yapılandırması, nesne sayıları, toplam boyutları ve kalıcı uygulama referansları belirlenir. Bucket RLS politikalarının katalog incelemesi ve nesne sahipliği bu ilk metadata/referans aracının kapsamında değildir; fiziksel yedek planından önce ayrı bir erişim denetimi olarak ele alınır. Mevcut finansal belge akışları `motto_assets` ve `receipts` kullanır; yalnız bu iki adı sabitlemek yeni veya unutulmuş bucket'ları kapsam dışı bırakabilir. [Finansal belge rollout sözleşmesi](private-financial-document-rollout.md) `storage://<bucket>/<tenant-path>` referanslarını, kısa ömürlü görüntüleme URL'lerini ve legacy `data:`/URL uyumluluğunu tanımlar. Legacy satırlar otomatik dönüştürülmez veya silinmez.

İlk aşamanın çalıştırma, anahtar saklama, durma koşulları ve kanıt sınırı
[salt okunur Storage envanteri runbook'unda](OPS-02-storage-inventory-runbook.md)
tanımlıdır. Mevcut araç yalnız metadata ve kalıcı referansları uzlaştırır;
manifestte ham yol/URL/tenant kimliği yerine HMAC-SHA256 takma adları ve toplu
bucket gerçekleri bulunur.

## Yerelde doğrulanan ilk aşama

- PostgreSQL adapteri `REPEATABLE READ READ ONLY` transaction'unda hem
  `transaction_read_only=on` hem de `transaction_isolation=repeatable read`
  değerlerini doğrulamadan envanter sorgularını çalıştırmaz; böylece tüm
  keyset sayfaları aynı snapshot'ı görür.
- Nesneler `(bucket_id, name)`, sabit dört finansal referans yüzeyi ise
  `(source_table, source_id)` anahtarıyla OFFSET kullanmadan sayfalanır.
- CLI hedef projeyi, Supabase direct/shared-pooler endpoint kimliğini, dedicated
  HMAC anahtarını ve Git/worktree dışındaki çıktı yolunu bağlantı kurulmadan
  önce doğrular. PostgreSQL istemcisine ham URL yerine doğrulanmış alanlar
  verilir; query/fragment override'ları reddedilir ve TLS sertifika doğrulaması
  açıktır. Manifest fsync ve rename sırasıyla atomik yazılır; POSIX'te `0600`
  istenir, Windows'ta gizlilik onaylı şifreli dizin ve NTFS ACL ile
  sağlanmalıdır.
- Windows sarmalayıcısı anahtarı CurrentUser DPAPI ile korur ve süreç
  değişkenlerini `finally` içinde eski değerlerine getirir.
- Yerel entegrasyon testi resmi Storage API'siyle yüklenen iki fixture üzerinde
  mevcut, eksik ve yetim nesne eşleştirmesini doğrulayıp test verisini temizler.

Bu kanıt production'da çalıştırma, nesne baytı indirme, dış hedefe kopyalama,
restore veya kurtarılabilirlik iddiası değildir.

## Yerelde doğrulanan AWS foundation aşaması

Phase A için AWS CDK v2 ve TypeScript altyapısı bağımsız
`infra/ops02-backup/` npm paketinde, kendi exact-version lockfile'ıyla
tanımlandı. Bu paket root uygulama bağımlılıklarını genişletmez; yalnız sentetik
hesap/rol context'i ve `eu-central-1` test Region'ıyla credential-free synth
üretir. Çalıştırma ve inceleme ayrıntıları
[AWS foundation yerel doğrulama runbook'unda](OPS-02-aws-foundation-runbook.md)
yer alır.

2026-10-10 yerel kanıtında temiz izole kurulum; altyapı format, typecheck,
`88/88` test ve synth kapısı; root `583` başarılı/`4` skipped testli kalite
kapısı ve `35/35` production build'i geçti. Sentetik CloudFormation
şablonu `28` kaynak, `13` output ve
`337828087FDE8EB7F9C3CD65B01C6D58CD18D2836E9CAC09A7550C2ACFA8A8D4`
SHA-256 değeri üretti. Secret/reference taramasında access key, `service_role`,
Supabase host'u veya plaintext secret görülmedi; iki `GenerateSecretString`
kaynağı yalnız `UNINITIALIZED` placeholder'dır. Şablondaki 15 literal wildcard
resource, KMS/service/describe policy yapılarıdır; kanıt yalnız testlerin
wildcard yönetici grant'lerini ve yazar rolündeki yetkisiz delete/bypass
izinlerini reddettiğini söyler, şablonda hiç wildcard olmadığını iddia etmez.
Writer trust'ı source account ve yapılandırılmış Region'ın ECS ARN'iyle
sınırlıdır; audit object'leri 365 gün `COMPLIANCE` Object Lock altındadır ve
güvenlik topic'i izlediği audit key'den bağımsız bir alert key kullanır.

İzole dependency ağacında bir yüksek önem dereceli transitive
`brace-expansion` advisory'si açık kalır; güvensiz override veya zorlanmış audit
fix uygulanmadı. GitHub'ın Node 22 altyapı workflow'u bu teslimatta
çalıştırılmadı. AWS kaynağı, production envanteri, byte kopyası, restore,
credential population, bootstrap, deploy, destroy veya push yapılmadı. Bu
foundation fiziksel backup veya kurtarılabilirlik kanıtı değildir; OPS-02
**Devam ediyor** kalır ve sıradaki iş sentetik fiziksel-byte kopya prototipidir.

## Önerilen koruma modeli

1. **Envanter ve eşleme:** Yetkili salt okunur erişimle bucket yapılandırması, nesne yolları ve ilgili veritabanı referansları çıkarılır. Manifest bucket, path, byte uzunluğu, mümkünse nesne sürüm/ETag bilgisi, indirme sonrası SHA-256, deneme zamanı ve kullanılan DB yedeği kimliğini içerir. ETag tek başına içerik hash'i sayılmaz.
2. **Fiziksel kopya:** Nesne baytları resmi [Storage indirme API'si](https://supabase.com/docs/guides/storage/management/download-objects) veya uygun S3 uyumlu arayüz üzerinden, yalnız sunucu tarafında çalışan ayrı bir operatör işiyle alınır. `storage.objects` tablosuna doğrudan yazılmaz. Tam yedek ilk aşamadır; artımlı strateji ancak tam yedek ve restore kanıtından sonra tasarlanır.
3. **Ayrı güven alanı:** Şifreli nesne kopyaları, manifest ve anahtarlar production Supabase projesinden ayrı bir hedefte tutulur. Hedefte sürümleme/değiştirilemezlik, erişim kaydı, anahtar rotasyonu ve silme koruması değerlendirilir. Supabase Storage'ın kendisinde [S3 object versioning desteği yoktur](https://supabase.com/docs/guides/storage/s3/compatibility); hedefin koruması ayrıca doğrulanmalıdır.
4. **Yetki:** Privileged S3 erişim anahtarları [RLS'yi atlayabilir](https://supabase.com/docs/guides/storage/s3/authentication). Bunlar tarayıcıya, `NEXT_PUBLIC_` değişkenine, Git'e, CI çıktısına veya paylaşılan rapora konmaz. En az yetki ve kısa ömür mümkün değilse kullanım penceresi, kasa, rotasyon ve erişim denetimi açıkça kaydedilir.
5. **Tutarlılık:** Canlı yazımlar sürerken bucket listesi ve DB yedeği tek atomik anı temsil etmez. İlk ve ikinci envanter geçişi arasındaki fark, başarısız indirmeler ve yeni/silinen nesneler raporlanır; eksik veya belirsiz nesne varsa paket kurtarılabilir diye onaylanmaz. Kritik sürüm için gerekirse kontrollü yazım duraklatma ayrı onaya tabidir. Yedek işi hiçbir nesneyi otomatik budamaz.
6. **Kanıt:** Ham manifest ve nesneler şifreli kalır. Git'e yalnız toplu sayımlar, başarısızlık sayısı, doğrulama zamanı, algoritma, sorumlu, saklama politikası ve hassas yol/kimlik içermeyen kanıt referansı girer. Her indirilen bayt dizisinin SHA-256 değeri restore sonrası tekrar hesaplanır.

## Kurtarma kapısı

- Önce sahte verili, production dışı bir projede tek nesne ve tam bucket geri yükleme provası yapılır. Hedef proje kimliği ve overwrite kapsamı iki kişi tarafından doğrulanır; mevcut nesnelere üzerine yazma varsayılan değildir.
- Nesneler Storage API/S3 ile geri yüklenir; veritabanı metadata'sı ve uygulama referansları ayrı restore planıyla eşleştirilir. Bucket ayarları, tenant erişim reddi, imzalı URL davranışı ve belge önizlemesi test edilir.
- Dosya sayısı ve byte toplamı yalnız başlangıç kontrolüdür. Restore edilen her nesnenin SHA-256 değeri manifestle eşleşmeli; DB'de referanslanan fakat eksik nesne ve yedekte olup referanslanmayan nesne ayrı raporlanmalıdır.
- Production'a gerçek geri yükleme; olay komutanı, veritabanı sahibi, güvenlik doğrulayıcısı, hedef kimlik, kapsam, geri dönüş noktası ve bakım penceresiyle **ayrı yazılı onay** gerektirir. Bu tasarım tek başına restore komutu çalıştırma izni değildir.

## Kabul ölçütleri ve açık kararlar

| Kapı            | Kabul kanıtı                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Kapsam          | Envanterdeki tüm bucket'lar sınıflandırılmış; kapsam dışı bırakılanlar gerekçeli ve onaylı.                                |
| Kopya bütünlüğü | Beklenen nesnelerin tamamı indirilmiş; başarısız indirme `0`; her dosyanın SHA-256 değeri manifestte.                      |
| Tutarlılık      | DB yedeği kimliği ile Storage manifesti eşleşmiş; iki envanter geçişi ve değişen/eksik nesneler açıklanmış.                |
| Kurtarma        | İzole ortamda fiziksel dosyalar ve metadata eşleştirilmiş, hash ve tenant negatif testleri geçmiş.                         |
| Operasyon       | Sorumlu ve yedek sorumlu, izleme, uyarı, saklama, silme koruması, anahtar rotasyonu ve periyodik prova takvimi onaylanmış. |

Uygulamadan önce işletme sahibiyle şu kararlar netleşmelidir: kabul edilebilir veri kaybı süresi (RPO), kurtarma süresi (RTO), yasal/işletmesel saklama süresi, şifreleme ve anahtar kasası, ayrı hedef sağlayıcı, maliyet tavanı, yedek sıklığı ve restore yetkilileri. Bu sayılar onaylanmadan SLA veya “tam koruma” iddiası yapılmaz.

## Teslimat sırası

1. Salt okunur bucket/DB referans envanteri ve veri sınıflandırması.
2. Seçeneklerin güvenlik, maliyet ve operasyon karşılaştırması; RPO/RTO/saklama onayı.
3. Sentetik nesnelerle dış hedefe şifreli tam kopya ve izole restore prototipi.
4. Eksik nesne, yetki sızıntısı, kesintiye uğrayan transfer ve yanlış hedef senaryolarını içeren otomatik testler.
5. Production işi için ayrı onay, en az yetkili kimlik bilgisi, izleme ve ilk kontrollü prova.

Bu sıranın herhangi bir aşaması canlı nesne silme, taşıma veya production'a geri yükleme yetkisi doğurmaz.
