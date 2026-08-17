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
