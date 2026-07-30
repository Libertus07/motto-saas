type FormRowProps = {
  label: string
  hint?: string
  children: React.ReactNode
}

export function FormRow({ label, hint, children }: FormRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-stone-300 text-xs font-semibold">{label}</label>
      {children}
      {hint && <p className="text-stone-500 text-[11px]">{hint}</p>}
    </div>
  )
}
