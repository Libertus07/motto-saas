'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      className="p-2 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition-colors border border-stone-700 flex items-center justify-center w-10 h-10"
      aria-label="Tema Değiştir"
    >
      <span className="dark:hidden">🌙</span>
      <span className="hidden dark:inline">☀️</span>
    </button>
  )
}
