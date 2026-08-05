'use client'

import { useRouter } from 'next/navigation'
import { ZReportEditor } from '@/features/z-reports/components/ZReportEditor'
import { ZReportModals } from '@/features/z-reports/components/ZReportModals'
import { ZReportUploadPanel } from '@/features/z-reports/components/ZReportUploadPanel'
import { useZReportWorkspace } from '@/features/z-reports/hooks/useZReportWorkspace'

export default function ZRaporuYukle() {
  const router = useRouter()
  const workspace = useZReportWorkspace()

  return (
    <div className="min-h-full bg-stone-950 text-white">
      <header className="flex items-center gap-3 border-b border-stone-800 bg-stone-900 px-4 py-4 sm:px-6">
        <button
          type="button"
          onClick={() => router.push('/dashboard/raporlar')}
          className="min-h-11 rounded-lg px-2 text-stone-400 transition-colors hover:bg-stone-800 hover:text-white"
        >
          ← Geri
        </button>
        <span className="text-stone-600" aria-hidden="true">
          |
        </span>
        <span className="text-2xl" aria-hidden="true">
          📸
        </span>
        <h1 className="font-bold text-blue-400">Gün Sonu Z Raporu</h1>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        {workspace.parsedData ? <ZReportEditor workspace={workspace} /> : <ZReportUploadPanel workspace={workspace} />}
      </main>
      <ZReportModals workspace={workspace} />
    </div>
  )
}
