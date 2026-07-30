type ToggleProps = {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone-800/80 last:border-0">
      <div>
        <p className="text-stone-200 font-semibold text-xs sm:text-sm">{label}</p>
        <p className="text-stone-400 text-[11px] mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-amber-500' : 'bg-stone-800 border border-stone-700'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  )
}
