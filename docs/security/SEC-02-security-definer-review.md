# SEC-02 SECURITY DEFINER Güvenlik İncelemesi

## Amaç ve sınır

Bu inceleme, Motto SaaS üretim veritabanındaki `SECURITY DEFINER`
fonksiyonlarını kanıta dayalı olarak sınıflandırır. Bu belge bir migration,
canlı düzeltme veya advisor uyarılarını topluca susturma yetkisi değildir.

- Üretim erişimi yalnız Security Advisor ve katalog `SELECT` sorgularıyla salt
  okunur yapıldı.
- Uygulanmış migration dosyaları değiştirilmedi.
- Auth ayarları, grants, fonksiyonlar ve canlı veriler değiştirilmedi.
- İnceleme dalı: `codex/security-definer-review`.
- Doğrulanan temel: `0fbb7b86221875742c8bfec5a4bede0df1dafde2`.

## Resmî güvenlik sözleşmesi

Supabase, varsayılan olarak `SECURITY INVOKER` kullanılmasını; zorunlu
`SECURITY DEFINER` fonksiyonlarında sabit `search_path`, tam şema adları ve açık
fonksiyon yetkileri kullanılmasını önerir. `SECURITY DEFINER` fonksiyonu sahibi
adına çalıştığından RLS'yi aşabilir ve `authenticated` yürütme yetkisi bulunan
bir `public` fonksiyon PostgREST RPC yüzeyinden çağrılabilir.

Kaynaklar:

- [Database Functions](https://supabase.com/docs/guides/database/functions)
- [Advisor 0029](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable)
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 2026-08-17 üretim snapshot'ı

Proje `zahdmrvhxsmqpeesrfkt` için Security Advisor salt okunur yenilendi.
Snapshot'ta:

- `get_public_login_branding(text)` hem `anon` hem `authenticated` için uyarıldı;
- `authenticated` rolü için toplam 12 ayrı `public` imza uyarıldı;
- iki `private` belge tablosunda RLS açık/politika yok INFO bulgusu vardı; bu
  tablolar istemciye açılmayan fail-closed dahili tablolardır;
- leaked-password protection kapalı WARN bulgusu vardı; bu fonksiyon
  sınıflandırmasının dışında ayrı Auth işletim kararıdır.

İlgili advisor açıklamaları:

- [Anon SECURITY DEFINER yürütme](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable)
- [Authenticated SECURITY DEFINER yürütme](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable)
- [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

## Katalog ve erişilebilirlik kanıtı

Canlı `pg_proc` kataloğu `public` ve `private` şemalarında 18 imza döndürdü.
Tüm fonksiyonların sahibi `postgres`. `anon`, `authenticated` ve `service_role`
rollerinin `public` şemasında `CREATE` yetkisi yok; bu rollerin `private`
şemasında `USAGE` veya `CREATE` yetkisi de yok.

Bağımlılık çözümlemesi metin eşleşmesiyle değil `pg_depend` üzerinden yapıldı:

- `public.get_user_organizations()` 98 güncel RLS politikasına bağlıdır.
- `public.get_user_org_role(uuid)` 7 güncel RLS politikasına bağlıdır.
- `private.can_access_organization_document(text,text)` 4 Storage politikasına
  bağlıdır.
- `public.is_organization_member(uuid,uuid)` 23 normal fonksiyon tarafından
  çağrılır.
- `public.current_organization_id()` 5 normal fonksiyon tarafından çağrılır.
- `private.get_user_organizations()` için güncel politika veya fonksiyon
  bağımlılığı yoktur.

## Uygulama çağıranları

Codebase-memory araması ve kaynak doğrulaması şu doğrudan çağrıları buldu:

- `check_ai_quota()`: beş kimliği doğrulayan AI API rotası.
- `current_organization_id()`: `src/lib/logger.ts`.
- `delete_supplier_transaction(uuid,uuid)`: tedarikçi sayfası.
- `delete_z_report_transaction(uuid,uuid)`: kimliği doğrulayan API rotası.
- `get_dashboard_stats(integer,numeric)`: dashboard service.
- `get_public_login_branding(text)`: giriş ekranı branding provider.
- `set_active_organization(uuid)`: organizasyon context'i.

`get_user_organizations`, `get_user_org_role`, `get_users_info`,
`has_organization_role` ve `is_organization_member` için doğrudan TypeScript
RPC çağrısı bulunmadı. İlk ikisi RLS politikalarında, son ikisi güvenli SQL
fonksiyonlarında kullanılır. `get_users_info` yalnız migration ve pgTAP
kanıtında bulundu.

## Kesin fonksiyon matrisi

“Test boşluğu” kararı güvenli kabul anlamına gelmez; remediation gerektirir.

| İmza                                                     | Advisor/ACL                                                                    | Çağrı ve sınır                                                                              | Mevcut test kanıtı                                              | İlk karar                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| `private.can_access_organization_document(text,text)`    | `authenticated`; private şema dış API'ye kapalı; `search_path=''`              | Dört Storage politikası; kullanıcı ve tenant yolu doğrulanıyor                              | `private_financial_documents.test.sql` pozitif ve çoklu denial  | `intentional-internal`             |
| `private.enforce_financial_document_reference()`         | İstemci rolleri yok; `search_path=''`                                          | Finansal belge trigger'ı; doğrudan RPC değil                                                | private belge ve finansal yazım pgTAP testleri                  | `platform-managed-or-trigger-only` |
| `private.get_user_organizations()`                       | Etkin ACL `PUBLIC` üzerinden geniş; private şemada USAGE yok; `search_path=''` | Güncel politika/fonksiyon bağımlılığı yok                                                   | Doğrudan sözleşme testi yok                                     | `revoke-unused-execute`            |
| `private.reconcile_legacy_financial_document_mappings()` | İstemci rolleri yok; `search_path=''`                                          | Migration/uzlaştırma yordamı                                                                | uzlaştırma ve çatışma pgTAP testleri                            | `platform-managed-or-trigger-only` |
| `public.check_ai_quota()`                                | `authenticated`; `search_path=''`                                              | Kimliği doğrulayan sunucu rotaları; çağıranın aktif organizasyonuna tek kota kaydı          | `advisor_security_hardening.test.sql` tenant/kayıt testi        | `intentional-exposed`              |
| `public.current_organization_id()`                       | `authenticated`; `search_path=pg_catalog`                                      | Logger ve beş SQL fonksiyonu; yalnız çağıranın profilindeki aktif üyeliği döndürüyor        | `active_organization_selection.test.sql`                        | `intentional-exposed`              |
| `public.delete_supplier_transaction(uuid,uuid)`          | `authenticated`; `search_path=public`                                          | Tarayıcı RPC; aktif üyelik kontrolü; çok tablolı atomik silme/telafi                        | Doğrudan cross-tenant/rollback pgTAP kanıtı bulunmadı           | `unproven-boundary`                |
| `public.delete_z_report_transaction(uuid,uuid)`          | `authenticated`; `search_path=public`                                          | Kimliği doğrulayan rota; aktif üyelik kontrolü; çok tablolı atomik silme/telafi             | Doğrudan cross-tenant/rollback pgTAP kanıtı bulunmadı           | `unproven-boundary`                |
| `public.get_dashboard_stats(integer,numeric)`            | `authenticated`; `search_path=''`                                              | Dashboard RPC; aktif organizasyon ve üyelik doğrulaması                                     | `advisor_security_hardening.test.sql` tenant sonucu             | `intentional-exposed`              |
| `public.get_public_login_branding(text)`                 | `anon`, `authenticated`; `search_path=''`                                      | Login öncesi slug ile yalnız ad/logo döndürüyor                                             | `login_branding.test.sql` dar çıktı ve tablo denial             | `intentional-exposed`              |
| `public.get_user_org_role(uuid)`                         | `authenticated`; `search_path=public`                                          | 7 RLS politikası; yalnız çağıranın rolünü döndürüyor; doğrudan API çağrısı yok              | Politika testleri dolaylı; doğrudan ACL/API testi yok           | `internal-move-or-wrapper`         |
| `public.get_user_organizations()`                        | `authenticated`; `search_path=public`                                          | 98 RLS politikası; yalnız çağıranın aktif üyeliklerini döndürüyor; doğrudan API çağrısı yok | Tenant RLS suite dolaylı; doğrudan ACL/API testi yok            | `internal-move-or-wrapper`         |
| `public.get_users_info(uuid[])`                          | `authenticated`; `search_path=''`                                              | Paylaşılan tenant kullanıcılarıyla sınırlı; uygulama çağıranı bulunmadı                     | `advisor_security_hardening.test.sql` outsider denial           | `revoke-unused-execute`            |
| `public.has_organization_role(uuid,text[],uuid)`         | `authenticated`; `search_path=pg_catalog`                                      | İç SQL helper; `p_user_id` çağıranın `auth.uid()` değeriyle aynı olmak zorunda              | `advisor_security_hardening.test.sql` başka kullanıcı denial    | `internal-move-or-wrapper`         |
| `public.is_organization_member(uuid,uuid)`               | `authenticated`; `search_path=pg_catalog`                                      | 23 iç fonksiyon; `p_user_id` çağıranın `auth.uid()` değeriyle aynı olmak zorunda            | `advisor_security_hardening.test.sql` başka kullanıcı denial    | `internal-move-or-wrapper`         |
| `public.rls_auto_enable()`                               | İstemci rolleri yok; `search_path=pg_catalog`                                  | Event-trigger yordamı                                                                       | `advisor_security_hardening.test.sql` ACL denial                | `platform-managed-or-trigger-only` |
| `public.set_active_organization(uuid)`                   | `authenticated`; `search_path=''`                                              | Organizasyon context RPC; aktif üyelik; idempotent profil+audit transaction                 | `active_organization_selection.test.sql` pozitif, denial, audit | `intentional-exposed`              |
| `public.set_default_organization()`                      | İstemci rolleri yok; `search_path=public`                                      | Trigger yordamı                                                                             | `advisor_security_hardening.test.sql` ACL denial                | `platform-managed-or-trigger-only` |

## Yerel replay, drift ve test kanıtı

Sabit Supabase CLI `2.111.0` kullanıldı. Global `npx` başlatıcısı çıktı
üretmeden takıldığı için önbellekteki doğrulanmış `2.111.0` ikilisi doğrudan
çalıştırıldı. İsteğe bağlı ve daha önce hatalı olduğu kanıtlanan Vector log
toplayıcısı resmî `start --exclude vector` bayrağıyla dışarıda bırakıldı;
Postgres, Auth, Storage, PostgREST, migration, RLS veya pgTAP kontrolleri
gevşetilmedi.

- `db reset --local --no-seed`: tüm 34 migration sıfırdan başarıyla uygulandı.
- `test db --local`: 9 dosya, 181 assertion, 0 hata.
- Üretim ve yerel migration sürüm listeleri birebir aynı ve son sürüm
  `20260816142006_bind_financial_writes_to_active_organization`.
- İlk tam fonksiyon-tanımı hash karşılaştırmasında 8 fark görüldü. Salt okunur
  gövde incelemesi farkın canlıdaki `CRLF` ve yerel replay'deki `LF` satır
  sonlarından kaynaklandığını gösterdi.
- `prosrc` satır sonları `LF` biçimine normalize edildiğinde 18/18 fonksiyon
  gövdesi hash'i eşleşti. Fonksiyon gövdesi drift'i yoktur.
- Owner, volatility ve `search_path` özellikleri canlı katalog ile yerel replay
  arasında eşleşti.

Test eşlemesi iki somut boşluğu korudu:

1. `delete_supplier_transaction(uuid,uuid)` için exact ACL, unauthenticated,
   cross-tenant, başarılı telafi/audit ve forced-failure rollback testleri yok.
2. `delete_z_report_transaction(uuid,uuid)` için aynı doğrudan RPC sınırları
   test edilmiyor.

Bu nedenle iki destructive RPC güvenli ilan edilmedi; gövdelerde aktif üyelik
kontrolü bulunması test kanıtının yerini tutmaz.

## Şimdiden doğrulanan remediation sınırı

Task 3 sonucu değişse bile aşağıdaki gruplar için ayrı forward-only remediation
planı gerekeceği şimdiden kanıtlandı:

1. `delete_supplier_transaction` ve `delete_z_report_transaction` için doğrudan
   cross-tenant, rollback, audit ve exact-ACL pgTAP sözleşmeleri eksik.
2. `public.get_user_organizations`, `public.get_user_org_role`,
   `public.is_organization_member` ve `public.has_organization_role` dış API
   şemasındaki definer yüzeyini gereksiz yere büyütüyor; private helper + public
   invoker wrapper tasarımı değerlendirilmelidir.
3. Bağımlılığı olmayan `private.get_user_organizations()` ve uygulama çağıranı
   olmayan `public.get_users_info(uuid[])` için exact-signature yürütme yetkisi
   kaldırılmalıdır; önce temiz replay ve davranış kanıtı tamamlanmalıdır.

Bu kararlar canlıda uygulanmış değildir.

## 2026-08-19 yerel remediation sonucu

SEC-02 remediation çalışması iki yeni, ileri yönlü migration ile yalnız yerel
dalda uygulanıp yeniden oynatıldı:

1. `20260817180000_isolate_security_definer_helpers.sql`
2. `20260817183000_harden_destructive_financial_rpcs.sql`

İlk migration, ayrıcalıklı üyelik mantığını dış API şemasından `private`
şemaya taşıdı ve beş eski public imzayı OID/bağımlılıklarını koruyan
`SECURITY INVOKER` uyumluluk wrapper'larına dönüştürdü. İkinci migration,
tedarikçi ve Z-Raporu silme RPC'lerini tenant doğrulaması, deterministik kilit
sırası, set tabanlı telafi ve aynı transaction içindeki append-only audit ile
sertleştirdi. Z-Raporu yazma ve silme yolları aynı tenant+batch advisory-lock
protokolünü kullanır.

Bu sonuç henüz üretime uygulanmış değildir. Canlı snapshot bölümü tarihsel
kanıt olarak yukarıda korunur; aşağıdaki matris temiz yerel replay sonrasındaki
hedef katalog durumudur.

### Son 18 `SECURITY DEFINER` imzasının sınıflandırması

Yerel `pg_proc` sorgusu 18/18 imzanın sahibini `postgres` olarak doğruladı.
Yeni private helper'lar, intentional public RPC'ler ve internal Storage
helper'ı `search_path=''` kullanır. İstemci rollerine kapalı iki eski
trigger/event-trigger yordamının mevcut dar `search_path` ayarları korunmuştur.

| Exact imza                                                | Son sınıf              | Etkin istemci sınırı                                             |
| --------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| `private.active_organization_ids()`                       | `wrapper-private`      | `authenticated`, `service_role`; private şema dış API'ye kapalı  |
| `private.can_access_organization_document(text,text)`     | `intentional-internal` | Storage politikaları için `authenticated`, `service_role`        |
| `private.current_organization_id()`                       | `wrapper-private`      | `authenticated`, `service_role`; çağıranın aktif üyeliği         |
| `private.current_user_has_organization_role(uuid,text[])` | `wrapper-private`      | `authenticated`, `service_role`; `auth.uid()` içeriden okunur    |
| `private.current_user_organization_role(uuid)`            | `wrapper-private`      | `authenticated`, `service_role`; aktif üyelik zorunlu            |
| `private.enforce_financial_document_reference()`          | `trigger-only`         | `anon`, `authenticated`, `service_role` yürütmesi yok            |
| `private.get_user_organizations()`                        | `revoked-unused`       | tüm istemci rollerine kapalı                                     |
| `private.is_current_user_organization_member(uuid)`       | `wrapper-private`      | `authenticated`, `service_role`; aktif üyelik zorunlu            |
| `private.reconcile_legacy_financial_document_mappings()`  | `migration-only`       | tüm istemci rollerine kapalı                                     |
| `public.check_ai_quota()`                                 | `intentional-exposed`  | `authenticated`, `service_role`                                  |
| `public.delete_supplier_transaction(uuid,uuid)`           | `intentional-exposed`  | `authenticated`, `service_role`; atomik finansal telafi+audit    |
| `public.delete_z_report_transaction(uuid,uuid)`           | `intentional-exposed`  | `authenticated`, `service_role`; atomik stok/kasa telafisi+audit |
| `public.get_dashboard_stats(integer,numeric)`             | `intentional-exposed`  | `authenticated`, `service_role`                                  |
| `public.get_public_login_branding(text)`                  | `intentional-exposed`  | dar login çıktısı için belgelenmiş tek `anon` istisnası          |
| `public.get_users_info(uuid[])`                           | `revoked-client`       | yalnız `service_role`; `anon`/`authenticated` kapalı             |
| `public.rls_auto_enable()`                                | `event-trigger-only`   | tüm istemci rollerine kapalı                                     |
| `public.set_active_organization(uuid)`                    | `intentional-exposed`  | `authenticated`, `service_role`; profil+audit atomik             |
| `public.set_default_organization()`                       | `trigger-only`         | tüm istemci rollerine kapalı                                     |

Public şemada `authenticated` veya belgelenmiş anonim istemci tarafından
ulaşılabilen definer kümesi tam olarak şu altı exact imzadır:

```text
public.check_ai_quota()
public.delete_supplier_transaction(uuid, uuid)
public.delete_z_report_transaction(uuid, uuid)
public.get_dashboard_stats(integer, numeric)
public.get_public_login_branding(text)
public.set_active_organization(uuid)
```

### Korunan public invoker sözleşmeleri

Aşağıdaki public imzalar `SECURITY INVOKER SET search_path=''` wrapper olarak
korundu; RLS politikaları, iç SQL çağrıları ve PostgREST sözleşmeleri aynı exact
imzaları kullanmaya devam eder:

```text
public.current_organization_id()
public.get_user_organizations()
public.get_user_org_role(uuid)
public.is_organization_member(uuid, uuid)
public.has_organization_role(uuid, text[], uuid)
```

`p_user_id` alan son iki wrapper, verilen kimlik `auth.uid()` ile aynı değilse
fail closed davranır. `private.get_user_organizations()` tüm istemci
rollerinden; `public.get_users_info(uuid[])` ise `anon` ve `authenticated`
rollerinden kaldırıldı.

### RED/GREEN ve katalog kanıtı

- Helper sınırı RED: 34 assertion'ın tamamı çalıştı ve migration öncesi hedef
  mimariye ait 12 assertion beklenen nedenle başarısız oldu.
- Destructive RPC RED: 40 assertion'ın tamamı çalıştı; cross-tenant hata
  sözleşmesi, immutable audit, başarı audit'i ve zorunlu rollback alanlarında
  24 beklenen hata üretildi.
- Caller RED: route testinde 2; supplier/Z-Raporu kaynak-sınırı testinde 2
  hedefli hata, duplicate audit ve ham teknik hata sızıntısını kanıtladı.
- Helper GREEN: 34/34 assertion geçti.
- Finansal RPC GREEN: integrity 26/26, security 40/40 ve gerçek iki-session
  concurrency 6/6 olmak üzere 72/72 odaklı assertion geçti.
- Temiz son replay: 36 migration sıfırdan uygulandı; 13 pgTAP dosyasında
  288/288 assertion geçti.
- Son katalog: 18 `SECURITY DEFINER`; dış public allowlist tam 6; beklenmeyen
  supplier/Z-Raporu overload'u yok; owner, ACL ve `search_path` sözleşmeleri
  exact signature düzeyinde doğrulandı.

### Advisor ve statik analiz sonucu

Supabase CLI `2.111.0` için desteklenen komutlarla yerel security ve performance
advisor çalıştırıldı; ikisi de `No issues found` döndürdü. Eski plandaki
`inspect db lint` yazımı bu CLI sürümünde desteklenmediğinden ayrıca
`supabase db lint --local --level warning` kullanıldı. Bu statik çözümleyici,
Task 4'ten önce de sınıflandırılmış olan
`private.reconcile_legacy_financial_document_mappings()` içindeki transaction
geçici tablosunu çözümleyemeyip `42P01` bildirir. Fonksiyonun runtime pgTAP yolu
ve temiz tam test paketi geçer; bulgu bu remediation tarafından üretilmiş yeni
bir advisor açığı değildir.

### Uygulama çağıranlarının son davranışı

- Z-Raporu API rotası yalnız `delete_z_report_transaction` RPC'sini çağırır;
  ayrı `activity_logs` insert'i yapmaz.
- Tedarikçi ve geçmiş Z-Raporu sayfaları başarılı silme sonrasında ikinci bir
  `logActivity` çağrısı yapmaz; audit'in tek kaynağı atomik RPC'dir.
- Beklenmeyen teknik ayrıntılar yalnız `devError` ile teknik loga yazılır.
  Kullanıcıya sırasıyla `Cari işlem silinemedi. Lütfen tekrar deneyin.` ve
  `Z-Raporu silinemedi. Lütfen tekrar deneyin.` mesajları gösterilir.
- Odaklı uygulama sözleşmesi 8/8 test; tam Vitest paketi 257 başarılı ve mevcut
  ortam kapısına bağlı 3 RLS testi skipped sonucu verdi.
- Current HEAD production build'i yerel Supabase public URL/anon değerleri
  yalnız process memory'de tutularak geçti; Next.js 35/35 statik sayfa üretti.
- Tam lint kapısı, hata maskeleme değişikliğinden sonra kullanılmayan eski
  `getErrorMessage` yardımcısını yakaladı. Davranışsız temizlik ayrı
  `79344b3` commit'inde yapıldı; odaklı 8/8 test, ESLint ve TypeScript
  kontrolleri yeniden geçti.

## Kalan üretim teslimat kapısı

`SEC-02` yalnız **yerelde tamam** durumundadır. `Tamamlandı` sayılması için ayrı
açık kullanıcı onayıyla şu sıra izlenmelidir:

1. Production environment approval ve imzalı güncel yedek attestation'ı al.
2. İki forward migration'ı yukarıdaki sırayla uygula; uygulanmış dosyaları
   yeniden yazma.
3. Canlı migration history ve PostgREST schema reload durumunu doğrula.
4. Canlı katalogda 18 definer sınıflandırmasını, exact altılı public allowlist'i,
   owner/ACL/overload/`search_path` sözleşmelerini salt okunur yeniden sorgula.
5. Canlı Security Advisor'ı yenile; authenticated/anon bulgularını exact imza
   bazında bu raporla karşılaştır.
6. Yetkili aynı-tenant smoke testlerini ve cross-tenant denial kontrollerini
   veri kaybına yol açmayacak kontrollü fixture'larla tamamla.

Bu adımlar yapılmadan push, PR, merge, deploy veya canlı migration sonucu bu
belgede iddia edilmez.
