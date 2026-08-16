# Production Database Deployment

Bu belge Motto SaaS production Supabase migration'larının kontrollü dağıtım
sözleşmesidir. Amaç, bir GitHub merge işleminin yedek ve insan onayı olmadan
canlı veritabanını değiştirmesini engellemektir.

## Güvenlik modeli

Production migration dağıtımı yalnız aşağıdaki zincir tamamlandığında yapılır:

1. Migration, normal bir `codex/` dalında geliştirilir.
2. Yerel temiz migration replay'i, pgTAP testleri ve advisor kontrolleri geçer.
3. Pull request içindeki `Database migrations and pgTAP` işi başarılı olur.
4. Değişiklik `master` dalına birleştirilir; bu adım veritabanını otomatik
   değiştirmez.
5. Production veritabanının 24 saatten yeni, şifreli ve geri-yükleme testi
   yapılmış yedeği hazırlanır.
6. `Production Database Deployment` iş akışı `master` dalından elle başlatılır.
7. Release SHA, hedef project ref, yedek zamanı, yedek SHA-256 değeri ve yedek
   dosya adı doğrulanır.
8. GitHub `Production` ortamının yetkili inceleyicisi salt okunur preflight için
   ilk onayı verir.
9. Pinned Supabase CLI migration listesini, `dry-run` ve advisor sonuçlarını
   üretir; henüz migration uygulamaz.
10. Yetkili inceleyici preflight kanıtını görüp ikinci production onayını verir.
11. İş akışı kanıtları ve `dry-run` sonucunu yeniden doğrular, bekleyen
    migration'ları uygular ve son migration/advisor durumunu kaydeder.

Bu zincirdeki herhangi bir hata `NO-GO` sonucudur. Hata giderilmeden ve yeni
kanıt üretilmeden dağıtım tekrarlanmaz.

## Kalıcı platform ayarları

### Supabase

Supabase Dashboard içinde:

1. `Project Settings > Integrations > GitHub` açılır.
2. Repository bağlantısı korunabilir.
3. `Deploy to production` kapalı tutulur.
4. Preview branching yalnız ayrı bir güvenli preview projesi/planı olduğunda
   etkinleştirilir.

`Deploy to production` yeniden açılırsa bu dokümandaki insan onay kapısı
atlanır. Bu nedenle değişiklik, güvenlik olayı olarak değerlendirilmelidir.

### GitHub Production ortamı

`Settings > Environments > Production` altında:

- Required reviewer: repository sahibi veya atanmış production sorumlusu.
- Deployment branch: yalnız `master`.
- Administrator bypass: kapalı.
- Environment secrets:
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_DB_PASSWORD`

Secret değerleri repository dosyalarına, workflow girdilerine, loglara veya
artifact'lere yazılmaz. Project ref gizli değildir ve bu proje için
`zahdmrvhxsmqpeesrfkt` olarak sabitlenmiştir.

## Pull request doğrulaması

`.github/workflows/ci.yml` içindeki `database-migrations` işi:

- Supabase CLI `2.111.0` sürümünü kullanır.
- Yerel Supabase ortamını production verisine bağlanmadan başlatır.
- Migration geçmişini boş veritabanından tekrar uygular.
- Tüm pgTAP testlerini çalıştırır.
- Security ve performance advisor kontrollerinde `error` seviyesini bloklar.
- İş başarılı veya başarısız olsa da yerel servisleri kapatır.

Bu iş canlı secret kullanmaz ve production veritabanına bağlanmaz.

## Production iş akışını başlatma

GitHub `Actions > Production Database Deployment > Run workflow` ekranında
branch olarak `master` seçilir ve şu alanlar doldurulur:

| Alan                    | Sözleşme                                                         |
| ----------------------- | ---------------------------------------------------------------- |
| `release_sha`           | Dağıtılacak master commit'inin tam 40 karakterlik SHA değeri     |
| `target_project_ref`    | Tam olarak `zahdmrvhxsmqpeesrfkt`                                |
| `backup_created_at_utc` | Manifestteki ISO-8601 UTC zamanı; en fazla 24 saat eski olabilir |
| `backup_sha256`         | Doğrulanmış şifreli `.zip.dpapi` dosyasının 64 haneli SHA-256'ı  |
| `backup_reference`      | Manifestteki onaylı şifreli yedek dosya adı                      |
| `confirmation`          | Tam olarak `DEPLOY zahdmrvhxsmqpeesrfkt`                         |

İlk iş yalnız yerel release/yedek kanıtlarını doğrular. İkinci iş GitHub
`Production` ortamında ilk insan onayını bekler ve salt okunur migration
listesi, `dry-run` ve advisor kanıtını üretir. Üçüncü iş ikinci `Production`
onayını bekler; onaylayan kişi preflight logundaki planı commit SHA ve yedek
kanıtıyla karşılaştırdıktan sonra uygulamaya izin verir. Uygulama işi olası
uzun bekleme veya uzak durum değişikliğine karşı kanıtları ve `dry-run`ı tekrar
doğrular.

## Yedek sözleşmesi

Kabul edilen yedek:

- Production hedefinden alınmış olmalıdır.
- Public/private/auth/storage metadata ve migration geçmişini kapsamalıdır.
- Düz metin SQL ve şifresiz arşiv bırakmamalıdır.
- Şifreli arşiv için SHA-256 manifesti bulunmalıdır.
- İzole bir veritabanına geri yüklenmiş; tablo sayıları ve finansal belge
  referans hash'leri kaynakla eşleşmiş olmalıdır.
- Geri yükleme sorumlusu ve saklama süresi belirlenmiş olmalıdır.

Veritabanı yedeğindeki `storage.objects` kayıtları fiziksel Storage nesne
baytlarının yedeği değildir. Fiziksel fiş/fatura dosyaları ayrı Storage yedekleme
ve geri-yükleme politikasına tabidir.

## Başarısızlık ve recovery

- `dry-run` beklenmeyen migration gösterirse onay verilmez.
- Migration uygulaması başarısız olursa aynı komut körlemesine tekrarlanmaz.
- `supabase db reset --linked` production ortamında hiçbir zaman kullanılmaz.
- Uygulanmış migration dosyası değiştirilmez; gerekiyorsa forward-only düzeltme
  migration'ı hazırlanır.
- `migration repair` yalnız schema ile migration geçmişinin gerçek durumu ayrı
  ayrı doğrulandıktan ve olay kaydı açıldıktan sonra kullanılır.
- Veri kaybı veya tenant sınırı şüphesinde uygulama yazmaları durdurulur, kanıtlar
  korunur ve geri-yükleme sorumlusu devreye alınır.

## Denetim kanıtı

Her production çalıştırması için aşağıdaki kayıtlar korunur:

- GitHub workflow run URL ve onaylayan kişi,
- release commit SHA,
- şifreli yedek dosya adı, oluşturma zamanı ve SHA-256,
- pre/post migration listesi,
- dry-run ve gerçek uygulama sonucu,
- security/performance advisor sonucu,
- production smoke ve gözlem sonucu.

Secret, erişim token'ı, veritabanı parolası veya müşteri verisi kanıt metnine
eklenmez.

## Resmî referanslar

- [Supabase GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration)
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
- [GitHub deployment reviews](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)
