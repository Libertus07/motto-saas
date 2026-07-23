---
name: history-accordion
description: "Guidelines for implementing and using the HistoryAccordion component across the Motto SaaS application."
---

# HistoryAccordion Skill

## Amaç
`HistoryAccordion` bileşeni, geçmiş işlem ve raporların bulunduğu listeleri düzenli, hiyerarşik ve kullanıcı dostu bir akordiyon yapısında göstermek için kullanılır. Tarih veya kategorilere göre gruplandırılmış büyük veri setlerini "premium" ve "cam (glassmorphism)" hissiyatlı bir arayüzle sunar.

## Kullanım Alanları
Projelerde geçmiş log, rapor veya fiş listelemesi gereken tüm sayfalarda (örneğin: `islem-gecmisi`, `raporlar/gecmis`, `raporlar/yatirim-gecmisi`, `raporlar/tedarikci-gecmisi`) standart tablo veya düz listeleme yerine bu bileşen kullanılmalıdır.

## Özellikler ve Yapı
- **Generic Veri Desteği (`<T>`)**: İçerisinde gösterilecek öğe (item) listesi istenilen türde tanımlanabilir (`T[]`).
- **Gruplama**: Veriler dışarıdan gruplanmış (`AccordionGroup<T>`) şekilde bileşene prop olarak geçirilir.
- **Render Props Mimarisi**: 
  - `renderHeaderRight`: Her bir akordiyon başlığının sağ kısmına özel (örneğin toplam ciro) bilgi eklenmesine olanak tanır.
  - `renderContent`: Akordiyon açıldığında içeriğin (`T[]` array'inin) nasıl render edileceğini tam bir esneklikle sayfa seviyesinde belirlemeye olanak tanır.
- **Glassmorphism Tasarımı**: Karanlık tema uyumlu (`bg-stone-900/50`, `backdrop-blur` vs.) premium görünüm sunar. Animasyonlu (`rotate-180`, `transition-all`) etkileşimleri destekler.

## TypeScript Interface'leri
```tsx
export interface AccordionGroup<T> {
    id: string;
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    items: T[];
}

interface HistoryAccordionProps<T> {
    groups: AccordionGroup<T>[];
    defaultExpandedIds?: string[];
    renderContent: (items: T[]) => React.ReactNode;
    renderHeaderRight?: (group: AccordionGroup<T>) => React.ReactNode;
    emptyStateMessage?: string;
}
```

## Örnek Kullanım
```tsx
import { HistoryAccordion } from '@/components/ui/HistoryAccordion';

// Sayfa içerisindeki kullanım örneği:
<HistoryAccordion
    groups={groupedLogs.map(group => ({
        id: group.monthKey,
        title: group.monthLabel,
        subtitle: `${group.logs.length} işlem`,
        icon: <span className="text-xl">📅</span>,
        items: group.logs
    }))}
    defaultExpandedIds={groupedLogs.length > 0 ? [groupedLogs[0].monthKey] : []}
    renderHeaderRight={(group) => (
        <div className="text-right">
            <p className="text-xs text-stone-500">Toplam İşlem</p>
            <p className="text-xl font-bold text-white">{group.items.length}</p>
        </div>
    )}
    renderContent={(logs) => (
        <div className="space-y-4">
            {logs.map(log => (
                <div key={log.id} className="p-4 bg-stone-900 rounded-lg">
                    {/* Log içeriği render edilir */}
                </div>
            ))}
        </div>
    )}
/>
```

## Kurallar ve Tavsiyeler
1. **Esneklik Korunmalıdır:** `HistoryAccordion` bileşenini güncellerken genel esnekliği (Render Props) bozacak state'ler veya sayfaya özgü iş mantıkları (örn: `handleDelete`, özel popup tetikleyiciler) bileşenin içine gömülmemelidir. Bu fonksiyonlar `renderContent` ile sayfadan gelmelidir.
2. **Performans:** Büyük veri listelerinde React'ın `map` ile doğru `key` prop'u kullanımına dikkat edilmelidir.
3. **Kapsüllenmiş Animasyonlar:** Toggle efekti, border highlight, ikon dönüşü gibi mikro animasyonlar standart olarak bileşen içerisinde kalmalıdır.
