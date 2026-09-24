# OPS-02 — Salt okunur Storage envanteri runbook'u

**Durum:** Araç ve yerel entegrasyon kanıtı hazır. Production envanteri,
fiziksel nesne kopyası ve geri yükleme yapılmadı. Bu runbook bunlara tek başına
yetki vermez.

## Amaç ve güvenlik sınırı

Bu aşama, Supabase Storage bucket/nesne metadata'sını finansal belge
referanslarıyla salt okunur bir PostgreSQL transaction'ında uzlaştırır. Manifest
ham nesne yolu, belge URL'si, organizasyon kimliği veya kaynak satır kimliği
içermez; nesne kimlikleri özel bir HMAC-SHA256 anahtarıyla takma adlandırılır.

Bu çıktı fiziksel yedek değildir. Nesne baytlarını indirmez, içerik SHA-256
doğrulaması yapmaz, geri yüklenebilirlik kanıtlamaz ve S3 anahtarı oluşturma,
nesne kopyalama, silme veya restore yetkisi vermez.

## Önkoşullar

- Yalnız yetkili operatör bilgisayarı; Node.js 22+ ve proje bağımlılıkları.
- Hedef proje kimliği tam olarak `zahdmrvhxsmqpeesrfkt`.
- Yalnız envanter için ayrılmış, en az 32 rastgele baytlık HMAC anahtarı. DB
  yedek attestation anahtarı tekrar kullanılmaz.
- Windows'ta anahtar yalnız mevcut kullanıcıya bağlı DPAPI kasasında:
  `%LOCALAPPDATA%\MottoSaaS\storage-inventory-hmac-key.dpapi`.
- Manifest hedefi Git deposu ve tüm bağlı worktree'lerin dışında, erişimi
  kısıtlanmış ve ayrıca şifrelenen bir dizin.
- Production için salt okunur bağlantı kimliği, değişiklik penceresi, sorumlu ve
  ikinci gözden geçiren yazılı olarak onaylanmış olmalı.

Anahtar ilk kez aşağıdaki komutla kaydedilir. Var olan dosya bilinçli rotasyon
olmadan üzerine yazılmaz:

```powershell
$env:OPS02_INVENTORY_HMAC_KEY = '<AYRI-BASE64-ANAHTAR>'
.\scripts\security\Initialize-StorageInventoryKey.ps1
Remove-Item Env:OPS02_INVENTORY_HMAC_KEY
```

Komut geçmişine gerçek anahtar yazmayın. Kurumsal kasa kullanılıyorsa değeri
süreç değişkenine denetimli bir gizli-değer enjeksiyonuyla sağlayın.

## Zorunlu yerel kanıt

Supabase CLI 2.111.0 ve Docker stack yerelde çalışırken `supabase status -o
env` çıktısındaki yalnız `DB_URL`, `API_URL` ve `SERVICE_ROLE_KEY` değerleri
süreç kapsamına eşlenir; dosyaya kaydedilmez. Test, `localhost` veya
`127.0.0.1` dışındaki hedefleri reddeder.

```powershell
$env:RUN_OPS02_STORAGE_INTEGRATION = 'true'
$env:TEST_DATABASE_URL = '<LOCAL-DB_URL>'
$env:TEST_SUPABASE_URL = '<LOCAL-API_URL>'
$env:TEST_SUPABASE_SERVICE_ROLE_KEY = '<LOCAL-SERVICE_ROLE_KEY>'
.\node_modules\.bin\vitest.cmd run tests/storage-inventory.integration.test.ts
```

Beklenen sonuç `1 passed` olmalıdır. Test iki benzersiz nesneyi resmi Storage
API'siyle yükler, geçici organizasyon/yatırım kayıtları oluşturur, salt okunur
collector'ı çalıştırır ve yalnız kendi fixture'larını teardown sırasında siler.

## Production ön kontrolü — ayrı onay zorunlu

Production komutu ancak aşağıdakiler yazılı olarak onaylandıktan sonra
hazırlanır:

1. hedef project ref, bağlantı kimliği ve salt okunur DB yetkisi;
2. UTC yakalama zamanı ve Git dışındaki şifreli çıktı dizini;
3. özel HMAC anahtarının sahibi, yedeği ve rotasyon prosedürü;
4. çalıştıran operatör ile çıktıyı inceleyen ikinci kişi;
5. son yerel entegrasyon, kalite kapısı ve build kanıtı.

Onaylı çalıştırma biçimi:

```powershell
.\scripts\security\New-StorageInventory.ps1 `
  -DatabaseUrl '<ONAYLI-SALT-OKUNUR-URL>' `
  -OutputFile 'D:\Sifreli-OPS02\storage-inventory.json' `
  -CapturedAtUtc '<UTC-ZAMANI>'
```

Başarı stdout'u yalnız şu alanları içerir:

```json
{
  "status": "PASS",
  "schema_version": "motto-saas-storage-inventory-v1",
  "captured_at_utc": "<UTC>",
  "buckets": 0,
  "objects": 0,
  "references": 0,
  "manifest_sha256": "<SHA-256>",
  "output_file_name": "storage-inventory.json"
}
```

## Durma koşulları

Aşağıdakilerden herhangi biri oluşursa çıktı tamamlanmış kanıt sayılmaz ve bir
sonraki aşamaya geçilmez:

- hedef proje kimliği eşleşmiyor;
- transaction'ın `transaction_read_only` değeri `on` değil;
- invalid referans veya çelişkili duplicate nesne metadata'sı var;
- DB'de referanslanan fakat Storage metadata'sında bulunmayan nesne var;
- sayfalama tamamlanmadı, sorgu/timeout/bağlantı hatası oluştu;
- stdout, stderr veya operatör kaydında URL, parola, anahtar, organizasyon
  kimliği ya da nesne yolu göründü;
- çıktı repo/worktree içinde, şifrelenmemiş veya erişim/saklama politikası
  onaysız;
- iki envanter geçişi arasında açıklanmamış değişiklik var.

## Kanıtın saklanması

- Ham manifest Git'e eklenmez; repository dışındaki şifreli hedefte tutulur.
- Release kaydına yalnız toplu sayımlar, `captured_at_utc`, şema sürümü,
  manifest SHA-256, sorumlu ve hassas olmayan kanıt referansı yazılır.
- Manifest paylaşılmadan önce dosyanın SHA-256 değeri yeniden hesaplanır.
- Saklama/silme süresi, yasal gereksinimler, RPO/RTO ve anahtar rotasyonu henüz
  onaylı değilse manifest uzun vadeli koruma veya kurtarma kanıtı sayılmaz.

Bir sonraki plan; ayrı şifreli hedefi, RPO/RTO/saklama değerlerini, fiziksel byte
transferini, nesne başına içerik SHA-256 doğrulamasını ve izole restore provasını
ayrıca tasarlayıp onaylatmalıdır.
