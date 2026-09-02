# SECURITY DEFINER Remediation Design

**Durum:** Kullanıcı tarafından 2026-08-17 tarihinde iki katmanlı güvenlik
mimarisi onaylandı.

**İlgili çalışma:** `SEC-02` — kalan `SECURITY DEFINER` bulgularının
sınıflandırılması ve kanıtlanmış yüzeylerin daraltılması.

## 1. Bağlam ve kanıt

Salt okunur üretim incelemesi ve temiz yerel replay şu temeli kanıtladı:

- `public` ve `private` şemalarında 18 canlı `SECURITY DEFINER` imzası vardır.
- Security Advisor, dış API şemasındaki 12 ayrı `public` imzayı
  `authenticated` rolü için; login branding imzasını ayrıca `anon` rolü için
  uyarır.
- Üretim ve repository 34 migration sürümünde eşleşir.
- Satır sonları normalize edildiğinde üretim ile temiz replay arasındaki 18
  fonksiyon gövdesinin tamamı eşleşir; migration dışı gövde drift'i yoktur.
- Temiz replay sonrası 9 pgTAP dosyasındaki 181 assertion geçer.
- `public.get_user_organizations()` 98, `public.get_user_org_role(uuid)` 7 RLS
  politikasının bağımlılığıdır.
- `public.is_organization_member(uuid,uuid)` 23, `public.current_organization_id()`
  5 normal fonksiyon tarafından kullanılır.
- İki destructive RPC için doğrudan cross-tenant, rollback, audit ve exact-ACL
  test kanıtı eksiktir.

Detaylı snapshot ve fonksiyon matrisi:
[SEC-02 inceleme raporu](../../security/SEC-02-security-definer-review.md).

## 2. Hedefler

1. Gerçek kullanıcı RPC'lerinin mevcut imzalarını ve uygulama çağrılarını
   korumak.
2. RLS ve SQL yardımcılarının ayrıcalıklı mantığını dış API şemasından
   `private` şemaya taşımak.
3. `public` uyumluluk yüzeyini mümkün olduğunda `SECURITY INVOKER` yapmak.
4. Kullanılmayan yürütme yetkilerini exact signature düzeyinde kaldırmak.
5. Destructive finansal RPC'leri kimlik, tenant, atomiklik, telafi ve audit
   sözleşmeleriyle kanıtlamak.
6. Advisor'da yalnız gerçekten dışarı açık kalması gereken, tek tek belgelenmiş
   definer RPC uyarılarını bırakmak.
7. Tüm değişiklikleri forward-only migration, temiz replay ve pgTAP ile yeniden
   üretilebilir kılmak.

## 3. Hedef dışı konular

- Location/scoped-role platform mimarisini bu görevde uygulamak.
- Mevcut kullanıcı rollerinin ürün yetkilerini yeniden tasarlamak.
- Login branding'in anonim erişimini kaldırmak.
- Canlı Auth leaked-password ayarını değiştirmek; bu ayrı işletim kararıdır ve
  kullanıcının mevcut Supabase planı gözetilmelidir.
- `SECURITY DEFINER` uyarılarını topluca susturmak veya global grant değişikliği
  yaparak çalışan RPC'leri belirsiz biçimde kapatmak.
- Uygulanmış migration dosyalarını yeniden yazmak.

## 4. Seçilen mimari

### 4.1 Katman A: Dış uygulama sözleşmeleri

Aşağıdaki fonksiyonlar gerçek uygulama/API çağrılarıdır ve exact grant ile dış
yüzeyde kalır:

| Fonksiyon                                       | İzinli roller                   | Tasarım kararı                                                                          |
| ----------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| `public.get_public_login_branding(text)`        | `anon`, `authenticated`         | Dar ad/logo çıktısı nedeniyle intentional `SECURITY DEFINER`; `search_path=''` korunur. |
| `public.set_active_organization(uuid)`          | `authenticated`, `service_role` | Üyelik doğrulayan ve profil+audit'i atomik yazan intentional `SECURITY DEFINER`.        |
| `public.check_ai_quota()`                       | `authenticated`, `service_role` | Aktif tenant kotasını atomik artıran intentional `SECURITY DEFINER`.                    |
| `public.get_dashboard_stats(integer,numeric)`   | `authenticated`, `service_role` | Yalnız doğrulanmış aktif tenant verisini özetleyen intentional `SECURITY DEFINER`.      |
| `public.delete_supplier_transaction(uuid,uuid)` | `authenticated`, `service_role` | Atomik finansal telafi RPC'si olarak definer kalır; gövde ve testleri sertleştirilir.   |
| `public.delete_z_report_transaction(uuid,uuid)` | `authenticated`, `service_role` | Atomik stok/kasa telafi RPC'si olarak definer kalır; gövde ve testleri sertleştirilir.  |

Her dış definer RPC için `PUBLIC` ve `anon` yetkisi açıkça kaldırılır; login
branding bunun belgelenmiş tek anonim istisnasıdır. Advisor'da kalacak her uyarı
exact `regprocedure` imzası ve test kanıtıyla raporlanır.

### 4.2 Katman B: Private ayrıcalıklı yardımcılar

Aşağıdaki mantık `private` şemada yeni, kullanıcı kimliğini içeriden alan
definer yardımcılarına ayrılır:

```text
private.current_organization_id()
private.active_organization_ids()
private.current_user_organization_role(uuid)
private.is_current_user_organization_member(uuid)
private.current_user_has_organization_role(uuid, text[])
```

Private yardımcılar:

- `auth.uid()` değerini içeriden okur;
- başka kullanıcı kimliği parametresi kabul etmez;
- yalnız `status = 'active'` üyeliklerini kabul eder;
- tüm tablo ve fonksiyon adlarını şema adıyla kullanır;
- `SECURITY DEFINER SET search_path = ''` kullanır;
- `PUBLIC` ve `anon` yürütmesini reddeder;
- `private` şema `USAGE` yetkisi yalnız `authenticated` ve `service_role`
  rollerine verilir; bu yetki tek başına tablo veya fonksiyon erişimi vermez;
- yalnız uyumluluk wrapper'larının çalışması için gereken exact private helper
  imzalarına `authenticated` ve `service_role` `EXECUTE` grant'i verilir;
- Data API exposed schema listesine eklenmez.

### 4.3 Public invoker uyumluluk wrapper'ları

RLS politikalarını, 23 iç fonksiyon çağrısını ve mevcut TypeScript RPC
sözleşmelerini tek seferde kırmamak için aşağıdaki exact public imzalar korunur
ancak `SECURITY INVOKER` wrapper'a dönüştürülür:

```text
public.current_organization_id()
public.get_user_organizations()
public.get_user_org_role(uuid)
public.is_organization_member(uuid, uuid)
public.has_organization_role(uuid, text[], uuid)
```

Wrapper kuralları:

- `search_path=''` ve tam şema nitelemesi kullanır.
- Yalnız karşılık gelen `private` yardımcıyı çağırır.
- `p_user_id` taşıyan iki legacy imzada parametre
  `auth.uid() IS NOT DISTINCT FROM p_user_id` ile doğrulanır; farklı kullanıcı
  adına sorgu yapılamaz.
- İmza ve dönüş tipi değişmediğinden PostgREST çağrıları, RLS dependency OID'leri
  ve iç fonksiyon sözleşmeleri korunur.
- Public wrapper owner ayrıcalığıyla çalışmadığından advisor'ın public definer
  uyarı yüzeyi daralır.

### 4.4 Kullanılmayan ve trigger-only yüzeyler

- Bağımlılığı olmayan legacy `private.get_user_organizations()` fonksiyonunun
  `PUBLIC`, `anon`, `authenticated` yürütme yetkileri kaldırılır. Fonksiyon ilk
  aşamada düşürülmez; rollback/forensic uyumluluk için mevcut bırakılır.
- Uygulama çağıranı bulunmayan `public.get_users_info(uuid[])` için
  `authenticated` yürütmesi kaldırılır; gerekiyorsa yalnız `service_role`
  korunur. Gelecekte organizasyon üye yönetimi, scoped-role sözleşmesiyle ayrı
  bir RPC olarak tasarlanır.
- `private.enforce_financial_document_reference()`,
  `private.reconcile_legacy_financial_document_mappings()`,
  `public.rls_auto_enable()` ve `public.set_default_organization()` doğrudan
  istemci grant'i olmadan trigger/migration yordamı olarak kalır.
- `private.can_access_organization_document(text,text)` Storage politikalarının
  intentional internal yardımcısı olarak korunur.

## 5. Destructive RPC veri akışı

Her iki silme RPC'si aynı güvenlik sırasını izler:

1. `auth.uid()` yoksa `28000` ile reddet.
2. `p_organization_id` boşsa aktif organizasyonu güvenli helper üzerinden çöz.
3. Çağıranın hedef organizasyonda aktif üyeliğini doğrula; aksi halde `42501`.
4. Hedef kayıt/batch'in aynı organizasyona ait olduğunu kilitli veya güvenli
   sorguyla doğrula.
5. Stok, tedarikçi borcu, kasa, satış/gider ve bağlı hareket telafilerini tek
   PostgreSQL function transaction'ında uygula.
6. Önceki audit kayıtlarını silme.
7. Başarılı sonuçta aynı transaction içinde yeni, tenant-scoped `SILME` audit
   kaydı ekle. Kayıt; hedef ID/batch ID, etkilenen kayıt sayıları ve geri alınan
   finansal/stok özetini içerir, fakat sır veya ham belge içeriği içermez.
8. Herhangi bir adım hata verirse tüm telafi ve audit yazımı birlikte rollback
   olur.

İstemci ikinci bir audit çağrısı yapmaz. Bu, çok tablolı iş akışının kısmi
başarılı kalmasını ve başarılı mutation'ın logsuz kalmasını önler.

## 6. Hata davranışı

- Kimlik yok: SQLSTATE `28000`, güvenli Türkçe mesaj.
- Tenant/üyelik yok: SQLSTATE `42501`, güvenli Türkçe mesaj.
- Geçersiz veya bulunmayan hedef: uygun `22023`/`P0002`, güvenli Türkçe mesaj.
- Beklenmeyen iç hata, tablo/constraint veya ham `SQLERRM` ayrıntısıyla istemciye
  sızdırılmaz.
- API ve UI mevcut genel Türkçe hata mesajlarını korur; teknik ayrıntı yalnız
  güvenli sunucu loguna gider.
- Başarısız silme hiçbir stok, bakiye, işlem veya audit değişikliği bırakmaz.

## 7. Migration stratejisi

Tek bir dev migration yerine iki bağımsız, ileri yönlü migration kullanılır:

1. **Helper boundary migration**
   - private helper'ları ekler;
   - public helper'ları invoker wrapper'a dönüştürür;
   - obsolete ACL'leri exact signature ile kaldırır;
   - owner, `search_path`, overload ve grant katalog sözleşmelerini doğrular.
2. **Destructive RPC hardening migration**
   - iki silme RPC'sini `search_path=''` ve tam şema adlarıyla değiştirir;
   - audit silme davranışını kaldırır;
   - atomik `SILME` audit event'ini ekler;
   - exact eski overload bulunmadığını yeniden doğrular.

Bu ayrım, helper yüzeyinin destructive finansal davranıştan bağımsız incelenip
geri alınabilmesini sağlar. Migration dosyaları Supabase CLI ile oluşturulur ve
flat `supabase/migrations/` dizininde tutulur; eski migrationlar değiştirilmez.

## 8. Test tasarımı

### 8.1 Katalog ve ACL pgTAP

Yeni testler şunları exact signature ile kanıtlar:

- public wrapper'lar `SECURITY INVOKER` ve `search_path=''`;
- private helper'lar `SECURITY DEFINER`, `search_path=''`, `PUBLIC/anon` kapalı;
- public external RPC grant allowlist'i;
- login branding dışındaki anonim fonksiyon sayısı sıfır;
- obsolete helper ve `get_users_info` authenticated yürütmesi kapalı;
- beklenmeyen overload yok;
- trigger-only fonksiyonlar doğrudan çalıştırılamıyor.

### 8.2 Davranış pgTAP

- Aynı tenant pozitif helper/RPC çağrıları.
- Başka kullanıcının ID'siyle `is_organization_member` ve
  `has_organization_role` denial.
- Başka tenant'ın dashboard, supplier transaction ve Z-report batch'i için
  denial.
- Supplier silmede borç, kasa ve hareket telafisi; Z-report silmede stok, satış,
  gider ve kasa telafisi.
- Forced mid-operation failure sonrası tüm iş tabloları ve audit sayıları
  değişmeden kalır.
- Başarıda eski audit geçmişi korunur ve tam bir yeni `SILME` event'i oluşur.
- Anon/login branding dar çıktı ve underlying tablo denial sözleşmesi korunur.

### 8.3 Kalite kapıları

- Zorunlu RED/GREEN kanıtı.
- Temiz `db reset --local --no-seed`.
- Tüm pgTAP testleri.
- Security ve performance advisor incelemesi.
- İlgili TypeScript caller testleri.
- `npm run check`.
- Uygulama sözleşmesi değişirse local güvenli env ile production build.
- `graphify update .` ve codebase-memory yenilemesi.
- Bağımsız spec ve code review.

## 9. Rollout ve geri dönüş

1. Yerel migration replay ve testler tamamlanır.
2. Ayrı `codex/` dalında cohesive commit ve bağımsız review yapılır.
3. Push/PR/GitHub CI yalnız kullanıcı onayıyla yapılır.
4. Üretim migration'ı, mevcut Production approval ve backup attestation kapısı
   olmadan uygulanmaz.
5. Helper migration ile destructive RPC migration ayrı olduğundan ilk aşama
   güvenliyken ikinci aşama ertelenebilir.
6. İleri yönlü geri dönüş migration'ı; public wrapper gövdelerini önceki güvenli
   tanımlara getirir ve grant'leri exact signature ile eski doğrulanmış duruma
   döndürür. Uygulanmış dosya silinmez veya değiştirilmez.

## 10. Kabul kriterleri

- 18 canlı definer fonksiyonun her biri intentional dış API, intentional
  internal, wrapper/private, revoke veya trigger-only sınıfında kanıtlanır.
- Public definer advisor seti yalnız altı intentional dış RPC ile sınırlıdır.
- RLS policy ve iç fonksiyon bağımlılıkları kırılmaz.
- Cross-tenant ve başka-kullanıcı denemeleri fail closed olur.
- İki destructive RPC atomik telafi ve silinmeyen audit geçmişiyle çalışır.
- Başarılı silme yeni tenant-scoped audit kaydı üretir.
- Temiz replay, tüm pgTAP ve repository kalite kapıları geçer.
- Canlı uygulama/deploy yalnız ayrı açık onay ve üretim kapısından sonra yapılır.
