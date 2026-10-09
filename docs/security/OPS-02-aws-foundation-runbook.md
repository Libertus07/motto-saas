# OPS-02 — AWS yedekleme foundation yerel doğrulama runbook'u

**Durum:** Phase A altyapı tanımı yerelde ve kimlik bilgisi olmadan doğrulandı.
Bu runbook AWS kaynağı oluşturma, production envanteri çıkarma, nesne baytı
kopyalama veya restore yetkisi vermez.

## Kanıt sınırı

`infra/ops02-backup/`, AWS CDK v2 ve TypeScript kullanan bağımsız bir npm
paketidir. Kendi `package.json` ve `package-lock.json` dosyaları vardır; root
uygulama bağımlılıklarıyla karışmaz. Yerel synth yalnız sentetik context
değerleriyle CloudFormation üretir ve AWS hesabına bağlanmaz.

Bu aşamadaki olumlu sonuç yalnız şunları kanıtlar:

- bağımlılıklar izole lockfile'dan temiz kurulabiliyor;
- format, TypeScript, 87 CDK assertion testi ve offline synth geçiyor;
- root kalite kapısı ve production uygulama build'i geçiyor;
- üretilen sentetik şablon beklenen kaynak ve güvenlik sözleşmesine uyuyor.

Bu sonuç bir AWS-deployed backup değildir. AWS kaynağı oluşturulmadı;
production envanteri çalıştırılmadı; Storage baytı okunmadı veya kopyalanmadı;
restore yapılmadı; AWS/Supabase kimlik bilgisi oluşturulmadı, doldurulmadı ya da
kullanılmadı. `bootstrap`, `deploy` ve `destroy` çalıştırılmadı. GitHub workflow'u
çalıştırılmadı ve branch pushlanmadı.

## Önkoşullar ve sabit sürümler

Çalışma dizini repository kökü olmalıdır. Yerel kanıt Windows PowerShell,
Node.js `24.11.1` ve npm `11.6.2` ile üretildi. GitHub workflow'u Node.js `22.x`
kullanacak şekilde tanımlıdır; bu teslimatta GitHub üzerinde çalıştırılmadı.
Paketin Node.js alt sınırı `>=22.12.0` olarak ele alınır.

İzole lockfile aşağıdaki kritik sürümleri sabitler:

| Bileşen       | Sürüm      |
| ------------- | ---------- |
| `aws-cdk-lib` | `2.272.0`  |
| AWS CDK CLI   | `2.1144.0` |
| Vitest        | `5.0.3`    |

`aws-cdk-lib@2.272.0 > minimatch@10.2.5 > brace-expansion@5.0.9` yolunda bir
yüksek önem dereceli transitive advisory açık kalır. Güvensiz bir
`overrides`/`resolutions`, zorlanmış audit fix'i veya semver dışı yükseltme
uygulanmadı. Bu bulgu yeni dependency sürümü seçilmeden önce tekrar denetlenmeli
ve production deploy onayında açık risk olarak değerlendirilmelidir.

## Sentetik context

`npm run synth:test --prefix infra/ops02-backup` şu değerleri kullanır:

| Context                    | Sentetik değer                                     |
| -------------------------- | -------------------------------------------------- |
| `stage`                    | `test`                                             |
| `account`                  | `111111111111`                                     |
| `region`                   | `eu-central-1`                                     |
| `securityPrincipalArn`     | `arn:aws:iam::111111111111:role/Ops02Security`     |
| `verificationPrincipalArn` | `arn:aws:iam::111111111111:role/Ops02Verification` |
| `recoveryPrincipalArn`     | `arn:aws:iam::111111111111:role/Ops02Recovery`     |

Hesap numarası ve rol ARN'leri yalnız offline test fixture'ıdır. Bir AWS
hesabını, production rolünü, müşteri kimliğini veya Supabase projesini temsil
etmez. `eu-central-1` yalnız EU Region guard'ını test eder; production Region
kararı değildir.

## Credential-free yerel kapı

Temiz kurulum ve izole altyapı kapısı:

```powershell
node --version
npm --version
npm ci --prefix infra/ops02-backup
npm run check --prefix infra/ops02-backup
```

`check` sırasıyla Prettier, `tsc --noEmit`, Vitest ve `cdk synth` çalıştırır.
Synth sırasında AWS credential, `AWS_PROFILE`, environment dosyası, Supabase
secret'i, CDK lookup'u veya account bağlantısı gerekmez.

Root repository kapısı:

```powershell
npm run check

$previousUrl = $env:NEXT_PUBLIC_SUPABASE_URL
$previousAnonKey = $env:NEXT_PUBLIC_SUPABASE_ANON_KEY
try {
  $env:NEXT_PUBLIC_SUPABASE_URL = 'https://ci-placeholder.supabase.co'
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'ci-build-placeholder'
  npm run build
} finally {
  if ($null -eq $previousUrl) {
    Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:NEXT_PUBLIC_SUPABASE_URL = $previousUrl
  }
  if ($null -eq $previousAnonKey) {
    Remove-Item Env:NEXT_PUBLIC_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
  } else {
    $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $previousAnonKey
  }
}
```

Placeholder değerleri yalnız Next.js build-time public configuration
doğrulamasını karşılar; production projesine bağlanmaz ve credential değildir.

2026-10-09 yerel kanıtı:

- temiz `npm ci --prefix infra/ops02-backup`: geçti;
- altyapı format/typecheck/test/synth kapısı: geçti, `87/87` test;
- root `npm run check`: geçti, `582` test başarılı ve `4` test bilinçli
  olarak skipped;
- `npm run build`: geçti, `35/35` build adımı tamamlandı.

## Beklenen kaynaklar ve güvenlik assertion'ları

Sentetik şablon tam olarak `27` kaynak ve `12` output üretir:

| Adet | CloudFormation türü           |
| ---: | ----------------------------- |
|    1 | `AWS::CloudTrail::Trail`      |
|    1 | `AWS::Events::Rule`           |
|    7 | `AWS::IAM::Policy`            |
|    7 | `AWS::IAM::Role`              |
|    3 | `AWS::KMS::Key`               |
|    1 | `AWS::Logs::LogGroup`         |
|    2 | `AWS::S3::Bucket`             |
|    2 | `AWS::S3::BucketPolicy`       |
|    2 | `AWS::SecretsManager::Secret` |
|    1 | `AWS::SNS::Topic`             |

On iki output yalnız bucket adları ile KMS key, görev rolü, güvenlik topic'i ve
secret container ARN'lerini içerir; secret değeri içermez.

Assertion'lar en az şu sınırları sabitler:

- backup bucket private, Versioning açık, Object Lock `COMPLIANCE`, varsayılan
  `90` gün retention, SSE-KMS, Bucket Key, Bucket Owner Enforced, dört public
  access block alanı ve retain-on-delete/update ile tanımlıdır;
- aylık namespace yalnız `COMPLIANCE` ve tam `365` gün retention isteğine izin
  verir; yazar rolünde delete, governance bypass, bucket yönetimi, KMS yönetimi
  veya backup payload okuma yetkisi yoktur;
- audit bucket ve KMS key'i backup hedefinden ayrıdır; CloudTrail yalnız backup
  bucket object data event'lerini seçer;
- writer, verifier, restore, key administration ve security audit görevleri
  ayrıdır; production context'inde üç insan görevi aynı ARN'i kullanamaz;
- verifier backup payload baytlarını okuyamaz; restore rolü yalnız onaylı
  object-version namespace'lerini okuyabilir;
- iki Secrets Manager kaynağı yalnız `status: UNINITIALIZED` ve rastgele
  `bootstrapNonce` üreten container'lardır; production secret'i içermez;
- CloudFormation termination protection açıktır ve yüksek riskli S3/KMS
  değişiklikleri encrypted alert topic'ine yönlendirilir.

## Şablonu deploy etmeden inceleme

Önce synth'i iki kez çalıştırın ve her çalıştırmadan sonra hash'i kaydedin:

```powershell
npm run synth:test --prefix infra/ops02-backup
Get-FileHash -Algorithm SHA256 -LiteralPath infra/ops02-backup/cdk.out/Ops02BackupFoundation-test.template.json
npm run synth:test --prefix infra/ops02-backup
Get-FileHash -Algorithm SHA256 -LiteralPath infra/ops02-backup/cdk.out/Ops02BackupFoundation-test.template.json
```

İki hash aynı olmalıdır. Bu teslimattaki beklenen SHA-256:

```text
AE77C5471D13335F04BE64FCA07A3BA3CBC06DBA808821D634C9A5FF04FF8FA5
```

Kaynak ve output sayıları deploy olmadan şöyle incelenir:

```powershell
$templatePath = 'infra/ops02-backup/cdk.out/Ops02BackupFoundation-test.template.json'
$templateSource = Get-Content -LiteralPath $templatePath -Raw
$template = $templateSource | ConvertFrom-Json

($template.Resources.PSObject.Properties | Measure-Object).Count
($template.Outputs.PSObject.Properties | Measure-Object).Count
$template.Resources.PSObject.Properties |
  ForEach-Object { $_.Value.Type } |
  Group-Object |
  Sort-Object Name |
  Select-Object Count, Name
```

Redacted güvenlik incelemesinde `AKIA`, `service_role`, `supabase.co`, plaintext
`SecretString` veya production/customer identifier bulunmamalıdır. Şablonda
beklenen iki `GenerateSecretString` yalnız `UNINITIALIZED` placeholder üretir.
Yetki testleri izinsiz delete/bypass ve wildcard yönetici grant'lerini reddeder.

Literal `Resource: "*"` sayısı sıfır değildir: mevcut şablonda `14` adet vardır.
Bunlar KMS resource policy'nin kendi key'ini ifade eden yapısı ile belirli AWS
service/describe policy şekilleridir. Bu nedenle kanıt “şablonda wildcard yok”
değil, “wildcard administrative permission yok ve beklenen wildcard yapıları
tek tek testlerle sınırlandı” şeklinde okunmalıdır. Sayının veya bağlamın
değişmesi yeniden güvenlik incelemesi gerektirir.

## Bu aşamada yasak komutlar

Aşağıdaki komutları veya eşdeğerlerini çalıştırmayın:

```text
cdk bootstrap
cdk deploy
cdk destroy
aws cloudformation deploy
aws cloudformation delete-stack
```

AWS credential veya OIDC yetkisi eklemeyin; secret container'larını doldurmayın;
production account/Region/project değeriyle synth etmeyin. Production AWS
mutasyonu, credential population ve canlı doğrulama ayrı plan ve açık kullanıcı
onayı gerektirir.

## Durma koşulları

Aşağıdakilerden biri görülürse kanıt üretimini durdurun ve sonucu geçersiz sayın:

- access key, secret, token, raw Supabase URL, `service_role`, müşteri yolu,
  tenant/organization kimliği veya production project referansı source,
  şablon, test çıktısı ya da log'a girerse;
- sentetik synth AWS credential, lookup, ağ erişimi veya account bağlantısı
  isterse;
- account/role guard başarısız olur veya Region `eu-*` dışında kalırsa;
- Versioning, Block Public Access, KMS encryption, Object Lock, `90` günlük
  günlük retention, `365` günlük aylık retention ya da retain policy eksilirse;
- yeni veya açıklanamayan wildcard action/resource, delete, retention bypass,
  public access veya yönetici yetkisi oluşursa;
- iki ardışık synth hash'i farklıysa ya da `27` kaynak/`12` output envanteri
  inceleme olmadan değişirse;
- test, typecheck, format, root check veya build kapılarından biri başarısızsa;
- bilinen `brace-expansion` bulgusuna ek yeni bir yüksek/kritik dependency
  bulgusu değerlendirilmeden bırakılırsa.

## Sonraki ayrı planlar

OPS-02 durumu **Devam ediyor** kalır. Sıradaki iş sentetik fiziksel-byte kopya
prototipidir: disposable Supabase/AWS fixture'larında bounded-memory transfer,
HMAC kimlikleri, draft/completed manifest, bağımsız SHA-256, S3 checksum, resume,
source mutation ve redaction davranışları kanıtlanmalıdır.

Bunu sırasıyla izole restore prototipi ve ayrıca yetkilendirilmiş production
envanteri/maliyet/onay planı izler. Production byte kopyası, production-derived
restore ve recurring schedule ancak kendi ayrı onayları ve ölçülmüş kanıtlarıyla
ele alınır.
