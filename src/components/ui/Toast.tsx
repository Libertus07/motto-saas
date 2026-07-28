'use client'

import { useEffect } from 'react'

export interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info' | 'warning'
  onDone: () => void
  duration?: number
}

export function Toast({ message, type = 'success', onDone, duration = 3500 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration)
    return () => clearTimeout(timer)
  }, [onDone, duration])

  const typeStyles = {
    success: {
      border: 'border-emerald-500/40',
      bg: 'bg-stone-900/90',
      text: 'text-emerald-400',
      shadow: 'shadow-[0_10px_30px_rgba(16,185,129,0.15)]',
      icon: '✨',
    },
    error: {
      border: 'border-red-500/40',
      bg: 'bg-stone-900/90',
      text: 'text-red-400',
      shadow: 'shadow-[0_10px_30px_rgba(239,68,68,0.15)]',
      icon: '⚠️',
    },
    warning: {
      border: 'border-amber-500/40',
      bg: 'bg-stone-900/90',
      text: 'text-amber-400',
      shadow: 'shadow-[0_10px_30px_rgba(245,158,11,0.15)]',
      icon: '⚡',
    },
    info: {
      border: 'border-blue-500/40',
      bg: 'bg-stone-900/90',
      text: 'text-blue-400',
      shadow: 'shadow-[0_10px_30px_rgba(59,130,246,0.15)]',
      icon: 'ℹ️',
    },
  }

  const current = typeStyles[type] || typeStyles.success

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 border ${current.border} ${current.bg} ${current.text} ${current.shadow} px-5 py-3.5 rounded-2xl backdrop-blur-xl animate-in slide-in-from-bottom-5 duration-200`}
    >
      <span className="text-xl" aria-hidden="true">
        {current.icon}
      </span>
      <span className="text-sm font-bold tracking-tight text-white">{message}</span>
      <button
        onClick={onDone}
        aria-label="Kapat"
        className="ml-3 text-stone-500 hover:text-white transition-colors text-base font-bold"
      >
        ✕
      </button>
    </div>
  )
}
