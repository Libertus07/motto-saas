export const investmentTourSteps = [
  {
    element: '#tour-inv-kpis',
    popover: {
      title: 'Yatırım Özetiniz 💰',
      description: 'Toplam maliyet, güncel değer ve birleşik kazanç görünümünü buradan izleyebilirsiniz.',
      side: 'bottom' as const,
      align: 'center' as const,
    },
  },
  {
    element: '#tour-inv-tools',
    popover: {
      title: 'Portföy Yönetimi 📈',
      description: 'Varlıklarınızı türüne veya alım tarihine göre gruplayıp sıralayabilirsiniz.',
      side: 'top' as const,
      align: 'start' as const,
    },
  },
  {
    element: '#tour-inv-add',
    popover: {
      title: 'Varlık Ekleyin 💎',
      description: 'Yeni döviz, altın veya gayrimenkul yatırımınızı portföye ekleyin.',
      side: 'bottom' as const,
      align: 'end' as const,
    },
  },
]
