import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react/no-unescaped-entities': 'error',
      '@next/next/no-img-element': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/immutability': 'error',
      '@typescript-eslint/no-require-imports': 'error',
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Agent examples and one-off diagnostics are not shipped application code.
    '.agents/**',
    'scripts/debug/**',
    // Local Supabase writes generated runtime bundles here when Docker starts.
    'supabase/.temp/**',
    // PWA build artifacts are generated from the service-worker configuration.
    'public/sw.js',
    'public/swe-worker-*.js',
    'public/workbox-*.js',
  ]),
])

export default eslintConfig
