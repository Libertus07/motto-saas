type SaveButtonProps = {
  onClick: () => void
  saving: boolean
}

export function SaveButton({ onClick, saving }: SaveButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 text-stone-950 font-extrabold px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-2 text-xs sm:text-sm"
    >
      {saving ? (
        <>
          <span className="w-4 h-4 border-2 border-stone-950 border-t-transparent rounded-full animate-spin" />
          <span>Kaydediliyor...</span>
        </>
      ) : (
        <>
          <span>✓</span>
          <span>Ayarları Kaydet</span>
        </>
      )}
    </button>
  )
}
