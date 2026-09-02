import type { NextConfig } from 'next'
import withPWAInit from '@ducanh2912/next-pwa'

import { imageConfig } from './src/config/image-policy'
import { excludeFrontendNavigationWorkerFromPrecache } from './src/config/pwa-policy'

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    manifestTransforms: [excludeFrontendNavigationWorkerFromPrecache],
  },
})

const nextConfig: NextConfig = {
  turbopack: {},
  images: imageConfig,
}

export default withPWA(nextConfig)
