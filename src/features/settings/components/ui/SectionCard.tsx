type SectionCardProps = {
  title: string
  description: string
  children: React.ReactNode
}

export function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-xl">
      <div className="px-6 py-4 border-b border-stone-800/80 bg-stone-950/60">
        <h3 className="font-extrabold text-white text-base">{title}</h3>
        <p className="text-stone-400 text-xs mt-0.5">{description}</p>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  )
}
