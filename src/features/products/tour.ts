import type { DriveStep } from 'driver.js'

export const productTourSteps: DriveStep[] = [
  {
    element: '#tour-products-create',
    popover: {
      title: 'Menü ürünü ekleyin',
      description: 'Yeni ürün için satış fiyatını ve reçetesini burada tanımlayın.',
    },
  },
  {
    element: '#tour-products-filters',
    popover: {
      title: 'Listeyi odaklayın',
      description: 'Arama, kategori ve sıralama ile uzun menüleri saniyeler içinde daraltın.',
    },
  },
  {
    element: '#tour-products-kpis',
    popover: {
      title: 'Marjı izleyin',
      description: 'Ciro, ortalama kâr marjı ve tahmini nakit katkısını birlikte değerlendirin.',
    },
  },
]
