import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import { dashboardModules } from '../constants'

export function ModuleGrid() {
  return (
    <section aria-labelledby="module-grid-title" className="space-y-4">
      <div>
        <p className="text-xs font-bold tracking-[0.14em] text-amber-400 uppercase">Çalışma alanları</p>
        <h2 id="module-grid-title" className="mt-1 text-xl font-black tracking-tight text-white">
          Tüm modüller
        </h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {dashboardModules.map(({ description, icon: Icon, path, title }) => (
          <Link
            key={path}
            href={path}
            className="group flex min-h-28 items-start gap-4 rounded-3xl border border-white/8 bg-stone-900/55 p-4 shadow-lg transition-all hover:-translate-y-0.5 hover:border-amber-400/25 hover:bg-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 sm:p-5"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-amber-400/15 bg-amber-400/8 text-amber-300 transition-colors group-hover:bg-amber-400/12">
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <strong className="text-sm font-black text-stone-100 transition-colors group-hover:text-amber-300">
                  {title}
                </strong>
                <ArrowUpRight className="size-4 shrink-0 text-stone-600 transition-colors group-hover:text-amber-400" />
              </span>
              <span className="mt-2 block text-xs leading-5 text-stone-500">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
