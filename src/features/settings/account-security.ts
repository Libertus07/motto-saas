export type AccountMessage = {
  text: string
  type: 'error' | 'success' | ''
}

export const EMPTY_ACCOUNT_MESSAGE: AccountMessage = { text: '', type: '' }

export const PASSWORD_STRENGTH = {
  colors: ['bg-rose-500', 'bg-orange-500', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500'],
  textColors: [
    'text-rose-400',
    'text-orange-400',
    'text-amber-400',
    'text-emerald-400',
    'text-emerald-400',
  ],
  labels: ['Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'],
} as const

export function calculatePasswordStrength(password: string) {
  if (!password) return 0

  let score = 0
  if (password.length >= 6) score += 1
  if (password.length >= 10) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/[0-9]/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1

  return Math.min(score, 4)
}
