import type { DriveStep } from 'driver.js'

export const materialTourSteps: DriveStep[] = [
  {
    element: '#tour-mat-add',
    popover: {
      title: 'Hammadde Ekle ➕',
      description: 'Tedarikçinizden aldığınız hammaddeleri sisteme buradan tek tek girebilirsiniz.',
      side: 'bottom',
      align: 'end',
    },
  },
  {
    element: '#tour-mat-bulk-edit',
    popover: {
      title: 'Hızlı Düzenleme ⚡',
      description: 'Fiyat güncellemelerini veya stok sayımlarını toplu olarak kaydedebilirsiniz.',
      side: 'bottom',
      align: 'center',
    },
  },
  {
    element: '#tour-mat-autocat',
    popover: {
      title: 'Yapay Zeka ile Düzenle 🤖',
      description: 'Yapay zeka hammaddeleri önerilen kategorilere ayırır.',
      side: 'bottom',
      align: 'center',
    },
  },
]
