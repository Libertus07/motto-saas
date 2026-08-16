# Motto SaaS Proje Yol Haritası

**Son doğrulama:** 2026-08-16<br>
**Doğrulanan temel:** `d0bbd790a486a14f9cf3a76d4f23c7ec8c2e11c1`<br>
**Aktif öncelik:** `ROADMAP-01` — Merkezi yol haritası ve yönetim doğrulaması

Bu belge projenin güncel görev durumunun tek özet kaynağıdır. Teknik ayrıntılar
bağlantılı spec, plan ve güvenlik belgelerinde tutulur. Eski planlardaki kutular
tek başına güncel tamamlanma kanıtı sayılmaz.

## Durumlar

- **Tamamlandı:** Gerekli teslimat hedefi kanıtlandı.
- **Yerelde tamam:** Yerel uygulama ve kontroller tamam; teslimat kapısı bekliyor.
- **Devam ediyor:** Şu anki ana görev.
- **Hazır:** Tanımlı ve başlanabilir.
- **Bekliyor:** Adlandırılmış bir önkoşula bağlı.
- **Engelli:** Yetki, erişim, karar veya dış durum bekliyor.
- **Ertelendi:** Bilinçli olarak sonraya bırakıldı.

## Doğrulanmış temeller ve yakın kuyruk

| ID           | Çalışma alanı ve sonuç                                                                                                                            | Durum        | Teslimat bilgisi                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SEC-01`     | **Organizasyon ve tenant güvenliği**<br>Sonuç: active-organization and tenant isolation foundation verified.                                      | Tamamlandı   | Sonraki: preserve during scoped authorization work.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: `6eedbd1`, PR #14 checks, production verification.                                                         |
| `DOC-01`     | **Özel finansal belge yaşam döngüsü**<br>Sonuç: private storage, stable references, authorized previews, and financial write invariants verified. | Tamamlandı   | Sonraki: preserve during location scoping.<br>Detay: [Özel belge depolama planı](plans/2026-08-07-private-financial-document-storage.md)<br>Kanıt: `9547ecb`, merge `d6c490e`, pgTAP and production closure evidence.                                               |
| `OPS-01`     | **Üretim veritabanı geçiş kapısı**<br>Sonuç: manual Production approval, signed backup attestation, and migration checks delivered.               | Tamamlandı   | Sonraki: require gate for future production DB changes.<br>Detay: [Özel finansal belge rollout](../security/private-financial-document-rollout.md)<br>Kanıt: `2e16632`, merge `d0bbd79`, GitHub Production configuration verification.                              |
| `ROADMAP-01` | **Merkezi yol haritası ve yönetim**<br>Sonuç: approved two-layer governance is being implemented.                                                 | Devam ediyor | Sonraki: complete validator, CI wiring, and local gates.<br>Detay: [Yol haritası yönetim tasarımı](specs/2026-08-16-project-roadmap-governance-design.md)<br>Kanıt: design commit `6f9bdfd`.                                                                        |
| `SEC-02`     | **Kalan `SECURITY DEFINER` bulguları**<br>Sonuç: every remaining advisor finding will receive an evidence-backed classification.                  | Hazır        | Sonraki: create a focused security review plan before any fix.<br>Detay: [Özel finansal belge rollout](../security/private-financial-document-rollout.md)<br>Kanıt: current production advisor findings exist and must be refreshed and reclassified at task start. |
| `DEP-01`     | **Bağımlılık güvenlik denetimi**<br>Sonuç: direct and transitive package risks will be classified without forced upgrades.                        | Hazır        | Sonraki: refresh the audit and trace each reachable production path.<br>Detay: [Yol haritası yönetim tasarımı](specs/2026-08-16-project-roadmap-governance-design.md)<br>Kanıt: setup audit is time-sensitive and must be refreshed at task start.                  |
| `OPS-02`     | **Supabase Storage fiziksel yedekleme ve kurtarma**<br>Sonuç: object bytes receive owned, retained, and restore-tested backup coverage.           | Hazır        | Sonraki: write a backup/recovery design before implementation.<br>Detay: [Özel finansal belge rollout](../security/private-financial-document-rollout.md)<br>Kanıt: current encrypted database backup explicitly excludes physical Storage object bytes.            |

## Mimari, tasarım ve platform iş akışları

| ID          | Çalışma alanı ve sonuç                                                                                             | Durum    | Teslimat bilgisi                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB-01`     | **DrawDB veritabanı mimarisi temeli**<br>Sonuç: the target database architecture will be documented and validated. | Bekliyor | Sonraki: begin after immediate hardening risks are controlled.<br>Detay: [DrawDB veritabanı mimarisi planı](plans/2026-08-10-drawdb-database-architecture.md)<br>Kanıt: approved dependency gate.                             |
| `DESIGN-01` | **Pen tasarım temeli ve çalışma alanı pilotu**<br>Sonuç: the product design foundation will be defined and tested. | Bekliyor | Sonraki: begin against an approved target domain/navigation contract.<br>Detay: [Pen tasarım temeli planı](plans/2026-08-10-pen-design-foundation-workspace-pilot.md)<br>Kanıt: approved dependency gate.                     |
| `PLAT-02`   | **Location foundation**<br>Sonuç: location foundation will establish the platform boundary.                        | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |
| `PLAT-03`   | **Location-scoped domain migration**<br>Sonuç: domain records will be safely scoped to locations.                  | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |
| `PLAT-04`   | **Scoped roles and authorization**<br>Sonuç: roles and authorization will enforce the approved scope.              | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |
| `PLAT-05`   | **URL-scoped workspace**<br>Sonuç: workspace navigation will reflect organization and location scope.              | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |
| `PLAT-06`   | **Onboarding and three-day trial**<br>Sonuç: new customers will receive guided onboarding and a three-day trial.   | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |
| `PLAT-07`   | **Subscriptions, entitlements, and quotas**<br>Sonuç: subscriptions will govern entitlements and quotas.           | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |
| `PLAT-08`   | **Referral Center and Motto Balance**<br>Sonuç: referrals and balance will be managed as a platform capability.    | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |
| `PLAT-09`   | **Platform management center**<br>Sonuç: platform administration will receive a dedicated management center.       | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |
| `PLAT-10`   | **Enterprise integrations**<br>Sonuç: enterprise integrations will extend the approved platform boundary.          | Bekliyor | Sonraki: use the dependency order in section 16 of the platform architecture.<br>Detay: [Platform mimarisi](specs/2026-08-07-motto-saas-platform-architecture-design.md)<br>Kanıt: approved platform architecture dependency. |

## Önerilen uygulama sırası

`ROADMAP-01 → SEC-02 / DEP-01 / OPS-02 → DB-01 → DESIGN-01 → PLAT-02…PLAT-10`

Bağımsız güvenlik ve operasyon işleri güvenli sırayla ele alınabilir. Kritik
tenant, finansal bütünlük, veri kaybı veya kurtarma riski çözülmeden ilgili
platform genişlemesi başlamaz.
