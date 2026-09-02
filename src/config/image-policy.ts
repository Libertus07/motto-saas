import type { NextConfig } from 'next'

export const SUPABASE_STORAGE_HOST = 'zahdmrvhxsmqpeesrfkt.supabase.co'

export const imageConfig = {
  remotePatterns: [
    {
      protocol: 'https',
      hostname: SUPABASE_STORAGE_HOST,
      port: '',
      pathname: '/storage/v1/object/**',
      search: '',
    },
    {
      protocol: 'https',
      hostname: 'images.unsplash.com',
      port: '',
      pathname: '/**',
      search: '',
    },
  ],
  maximumRedirects: 0,
  maximumResponseBody: 5_000_000,
  dangerouslyAllowSVG: false,
  qualities: [75],
} satisfies NonNullable<NextConfig['images']>
