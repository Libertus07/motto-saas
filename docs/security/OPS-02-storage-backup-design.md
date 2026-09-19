# OPS-02 — Storage fiziksel yedekleme ve kurtarma tasarımı

**Durum:** Tasarım taslağı. Canlı yedek alınmadı, geri yükleme yapılmadı ve bu belge production işlem yetkisi vermez.

## Problem ve kapsam

Mevcut [production veritabanı yedeği](production-database-deployment.md) `storage.objects` kayıtlarını içerebilir; nesnelerin fiziksel baytlarını içermez. Supabase de veritabanı yedeğinin Storage nesnelerini geri getirmediğini [belirtir](https://supabase.com/docs/guides/platform/backups). Bu nedenle veritabanı yedeği ile Storage yedeği ayrı ama eşleştirilebilir kanıt paketleri olmalıdır.

Önce salt okunur envanterle production projesindeki **bütün** bucket'lar, nesne sayıları, toplam boyut, sahiplik, uygulama referansları ve erişim politikaları belirlenir. Mevcut finansal belge akışları `motto_assets` ve `receipts` kullanır; yalnız bu iki adı sabitlemek yeni veya unutulmuş bucket'ları kapsam dışı bırakabilir. [Finansal belge rollout sözleşmesi](private-financial-document-rollout.md) `storage://<bucket>/<tenant-path>` referanslarını, kısa ömürlü görüntüleme URL'lerini ve legacy `data:`/URL uyumluluğunu tanımlar. Legacy satırlar otomatik dönüştürülmez veya silinmez.

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
