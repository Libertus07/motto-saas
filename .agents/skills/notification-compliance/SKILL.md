---
name: notification-compliance
description: Motto-SaaS projesindeki tüm kullanıcı bildirimleri (alert) ve onay pencerelerinin (confirm) custom hazırlanan modern modal/notification provider ile yapılmasını zorunlu kılar.
---

# Notification ve Confirm Modal Kullanım Standartları

Bu yetenek (skill), Motto-SaaS projesinde çalışan tüm AI geliştirme araçlarının, kullanıcıya bilgi verirken (`alert`) veya onay alırken (`confirm`) tarayıcının yerleşik (native) fonksiyonlarını kullanmasını yasaklayıp, projenin şık ve mor temasına uygun hazırlanan **`useNotification`** bileşenini kullanmasını zorunlu kılar.

## 🛠️ Temel Kurallar

1. **Native alert() ve confirm() Yasaktır:**
   - Kod üzerinde kesinlikle `alert('Mesaj')` veya `confirm('Emin misiniz?')` gibi tarayıcı pencereleri kullanılmamalıdır.
   - Tüm bildirim ve onaylar şık, animasyonlu ve dark-mode temalı modal üzerinden yürütülmelidir.

2. **`useNotification` Entegrasyonu:**
   - **Import adresi:** `import { useNotification } from '@/components/NotificationProvider'`
   - **Kullanım Yöntemi:**
     ```typescript
     const { showAlert, showConfirm } = useNotification()
     ```

### 📝 Örnek Kullanım (Bilgilendirme / Alert):
`showAlert` fonksiyonu asenkron çalışır (Promise döner) ve kapatıldığında resolve olur.
```typescript
const { showAlert } = useNotification()

// Temel bilgi
await showAlert('Yatırım fişi başarıyla kaydedildi!', 'success')

// Hata bildirimi
await showAlert('İşlem sırasında bir hata oluştu.', 'error')

// Uyarı bildirimi
await showAlert('Bu hesaba ait bakiye yetersiz görünüyor.', 'warning')
```

### 📝 Örnek Kullanım (Onay / Confirm):
`showConfirm` fonksiyonu asenkron olarak çalışır ve kullanıcı "Onayla" dediğinde `true`, "İptal" dediğinde `false` döner.
```typescript
const { showConfirm } = useNotification()

const confirmed = await showConfirm(
    'Bu yatırımı silmek istediğinize emin misiniz?', 
    'Yatırım Silme Onayı 🗑️'
)

if (confirmed) {
    // Silme işlemini yap
}
```

## 🚨 Denetim Adımları
Bundan sonra projede yapılan her kod değişikliği talebinde veya yeni sayfa tasarımlarında:
1. Sayfalarda kullanıcıya dönen hata mesajları, başarı bildirimleri ve silme onayları taranacak.
2. `alert(...)` veya `confirm(...)` kullanan kod parçaları tespit edilirse anında `useNotification()` hook'u ile güncellenecektir.
