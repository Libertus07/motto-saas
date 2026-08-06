import Link from 'next/link'
import { ArrowRight, PackageX, X } from 'lucide-react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import type { CriticalStockItem } from '../types'

type CriticalStockDialogProps = {
  items: CriticalStockItem[]
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function CriticalStockDialog({ items, onOpenChange, open }: CriticalStockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(720px,calc(100svh-2rem))] w-full max-w-xl gap-0 overflow-hidden rounded-[1.75rem] border border-white/10 bg-stone-950 p-0 text-stone-100 shadow-2xl"
      >
        <DialogHeader className="relative border-b border-white/8 p-5 pr-16 sm:p-6 sm:pr-16">
          <div className="flex items-start gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-red-400/20 bg-red-400/10 text-red-400">
              <PackageX className="size-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-black text-white">Kritik stok detayları</DialogTitle>
              <DialogDescription className="mt-2 leading-6 text-stone-400">
                Sipariş planına öncelikli olarak eklenmesi gereken hammaddeler.
              </DialogDescription>
            </div>
          </div>
          <DialogClose
            aria-label="Pencereyi kapat"
            className="absolute right-4 top-4 flex size-[44px] items-center justify-center rounded-xl text-stone-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <X className="size-5" />
          </DialogClose>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 sm:p-6">
          {items.length > 0 ? (
            items.map((item) => (
              <article
                key={item.id}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-stone-900/65 p-4"
              >
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-white">{item.name}</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    Güvenli sınır: {item.critical_stock_level} {item.unit}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[0.65rem] font-bold tracking-wide text-stone-600 uppercase">Mevcut</p>
                  <p
                    className={`mt-1 text-lg font-black ${item.stock_quantity <= 0 ? 'text-red-400' : 'text-amber-400'}`}
                  >
                    {item.stock_quantity} <span className="text-xs text-stone-500">{item.unit}</span>
                  </p>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-2xl border border-white/8 bg-stone-900/50 p-8 text-center text-sm text-stone-500">
              Şu anda kritik seviyede stok bulunmuyor.
            </p>
          )}
        </div>
        <DialogFooter className="m-0 border-t border-white/8 bg-stone-900/75 p-4 sm:p-5">
          <DialogClose
            render={
              <Link
                href="/dashboard/hammaddeler"
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-5 text-sm font-black text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
              />
            }
          >
            Hammaddelere git
            <ArrowRight className="size-4" />
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
