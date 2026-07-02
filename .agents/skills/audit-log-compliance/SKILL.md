---
name: audit-log-compliance
description: Motto-SaaS projesinde yapılan tüm veritabanı (insert/update/delete) işlemlerinden sonra Audit Log (İşlem Geçmişi) tablosuna (logActivity) kayıt atılmasını denetler ve zorunlu kılar.
---

# Audit Log (İşlem Geçmişi) Entegrasyon Kuralları

Bu yetenek (skill), Motto-SaaS projesinde çalışan tüm AI geliştirme araçlarının, kod üzerinde yaptıkları veritabanı (Supabase) yazma, silme ve güncelleme işlemlerinden sonra mutlaka `logActivity` (src/lib/logger.ts) fonksiyonunu entegre etmesini zorunlu kılar.

## 🛠️ Temel Standartlar

1. **Log Entegrasyonu Zorunluluğu:**
   - Kodda yapılan her Supabase `.insert()`, `.update()`, `.delete()` çağrısından hemen sonra, işlem başarılı olduğunda `logActivity` fonksiyonu çağrılmalıdır.
   - İster frontend (`page.tsx` bileşenleri), ister backend (`route.ts` API uçları) olsun, bu kural istisnasız uygulanmalıdır.

2. **`logActivity` Kullanım Şablonu:**
   - **Import adresi:** `import { logActivity } from '@/lib/logger'` (Frontend) veya sunucu tarafında uygun logger yolu.
   - **Parametreler:**
     - `moduleName`: İşlem yapılan ana ekranın veya tablonun adı (Örn: 'Yatırımlar', 'Tedarikçi', 'Stok', 'Giderler', 'Z-Raporu').
     - `actionType`: `EKLEME`, `GUNCELLEME`, `SILME` değerlerinden biri.
     - `description`: İşlemin ne olduğunu açıklayan anlaşılır bir Türkçe metin.
     - `metadata` (Opsiyonel): İşlemin detaylarını barındıran JSON objesi (Tutar, adet, etkilenen kayıt ID'leri vb.).

### 📝 Örnek Kullanım (Frontend / Client Component):
```typescript
import { logActivity } from '@/lib/logger'

// Ekleme veya silme işleminden sonra:
await logActivity('Yatırımlar', 'SILME', `Yatırım Fişi Silindi: ${name}`, {
    detay: `Silinen Yatırım ID (${id})`
})
```

### 📝 Örnek Kullanım (API / Server Side):
Eğer API içinden doğrudan log atılacaksa, sunucu taraflı Supabase/Logger client'ı aracılığıyla işlem loglanmalıdır.

## 🚨 Denetim Adımları
Bundan sonra projede yapılan her kod değişikliği talebinde:
1. Değiştirilen dosyalarda veritabanı işlemi (Supabase Insert/Update/Delete) olup olmadığı kontrol edilecek.
2. Eğer varsa, bu işlemlerin hemen altına uygun formatta `logActivity` çağrısının eklenip eklenmediği denetlenecek.
3. Eksik olan log çağrıları anında koda entegre edilecektir.
