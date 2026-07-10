'use client'

import { useEffect } from 'react'
import { devError } from '@/lib/debug'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        devError('Beklenmeyen bir sayfa hatası oluştu:', error)
    }, [error])

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-6">
            <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-4xl mb-4">
                ⚠️
            </div>
            <h2 className="text-2xl font-bold text-white">Bir Şeyler Ters Gitti!</h2>
            <p className="text-stone-400 max-w-md">
                Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin veya sayfayı yenileyin.
                <br /><br />
                <span className="text-xs text-stone-600 bg-stone-900 px-2 py-1 rounded font-mono">
                    {error.message || 'Bilinmeyen hata'}
                </span>
            </p>
            <button
                onClick={() => reset()}
                className="px-6 py-3 bg-amber-600 hover:bg-amber-700 transition-colors rounded-xl text-white font-medium flex items-center gap-2"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Tekrar Dene
            </button>
        </div>
    )
}
