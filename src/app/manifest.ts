import type { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Motto SaaS - Restoran Zekası',
    short_name: 'Motto SaaS',
    description: 'Restoran ve Kafe Yönetim Sistemi',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0c0a09',
    theme_color: '#0c0a09',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/logo.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/logo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
