export function SettingsHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-800/80 bg-stone-900/90 px-4 py-4 backdrop-blur-xl sm:px-8">
      <div className="mx-auto flex max-w-7xl items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10 text-2xl text-amber-400 shadow-inner">
          ⚙️
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">Ayarlar</h1>
            <span className="rounded-full border border-stone-700 bg-stone-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
              Sistem & Hesap Yapılandırması
            </span>
          </div>
          <p className="mt-0.5 text-xs text-stone-400">
            İşletme profili, hesap güvenliği, finansal parametreler ve bildirim tercihleri.
          </p>
        </div>
      </div>
    </header>
  )
}
