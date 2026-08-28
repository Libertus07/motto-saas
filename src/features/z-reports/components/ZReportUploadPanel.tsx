import { SafeUserImage } from '@/components/ui/SafeUserImage'
import type { ZReportWorkspace } from '../hooks/useZReportWorkspace'

export function ZReportUploadPanel({ workspace }: { workspace: ZReportWorkspace }) {
  const hasPreview = Boolean(workspace.imageUrl || workspace.fileText)
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-dashed border-stone-800 bg-stone-900 p-5 text-center sm:p-8">
        <div className="mb-4 text-6xl" aria-hidden="true">
          🧾
        </div>
        <h2 className="mb-2 text-xl font-bold">Belge Yükleyin</h2>
        <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-stone-400 sm:text-base">
          Görsel, PDF, XML, JSON, XLSX veya CSV raporunu yükleyin; sistem satışları okuyup eşleşmeleri hazırlasın.
        </p>
        <label className="relative block min-h-32 cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-stone-700 bg-stone-900/50 p-6 text-center transition-colors hover:border-amber-400">
          <input
            type="file"
            multiple
            accept="image/*,application/pdf,text/xml,.xml,application/json,.json,.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={workspace.handleFileUpload}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          <span className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-bold text-white transition-colors hover:bg-blue-500">
            Belge Seç / Çek
          </span>
          <span className="mt-3 block text-sm text-stone-500">JPG, PNG, PDF, XML, JSON, XLSX ve CSV</span>
        </label>
        <p className="mt-3 text-xs leading-5 text-stone-500 sm:text-sm">
          Elektronik tablolar için yalnızca XLSX veya CSV seçin; XLS ve XLSM dosyaları güvenlik nedeniyle kabul edilmez.
        </p>
        <div className="my-6 flex items-center gap-4" aria-hidden="true">
          <div className="h-px flex-1 bg-stone-800" />
          <span className="text-xs font-bold text-stone-500 sm:text-sm">VEYA MANUEL GİRİN</span>
          <div className="h-px flex-1 bg-stone-800" />
        </div>
        <button
          type="button"
          onClick={workspace.startManualMode}
          disabled={workspace.analyzing || workspace.loading}
          className="min-h-12 w-full rounded-xl border border-stone-700 bg-stone-800 py-3 font-bold text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          ✍️ Z Raporunu Manuel Gir
        </button>
      </section>

      {hasPreview && (
        <section className="rounded-xl border border-stone-800 bg-stone-900 p-5 sm:p-6">
          <h3 className="mb-4 font-bold">Önizleme</h3>
          <div className="mb-6 flex min-h-40 items-center justify-center">
            {workspace.imageUrl && workspace.fileType === 'image' ? (
              <SafeUserImage
                src={workspace.imageUrl}
                alt="Yüklenen Z Raporu"
                width={400}
                height={384}
                className="mx-auto max-h-96 rounded-lg object-contain"
              />
            ) : (
              <div className="py-8 text-center">
                <div className="mb-3 text-6xl" aria-hidden="true">
                  {workspace.fileType === 'pdf' ? '📄' : workspace.fileType === 'xml' ? '📰' : '🤖'}
                </div>
                <p className="font-bold text-stone-300">
                  {workspace.fileType === 'pdf' ? 'PDF' : workspace.fileType === 'xml' ? 'XML' : 'JSON / XLSX / CSV'}{' '}
                  seçildi
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void workspace.analyze()}
            disabled={workspace.analyzing}
            className="min-h-12 w-full rounded-xl bg-amber-500 py-3 font-bold text-stone-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {workspace.analyzing ? 'Yapay Zeka Raporu Okuyor...' : 'Yapay Zeka ile Analiz Et ✨'}
          </button>
        </section>
      )}
    </div>
  )
}
