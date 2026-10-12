import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Motto OIP - Restoran Zekası',
    short_name: 'Motto OIP',
    description: 'Restoran ve Kafe Yönetim Sistemi',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0c0a09',
    theme_color: '#0c0a09',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/motto-oip-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/motto-oip-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
