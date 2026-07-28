'use client'

import * as React from "react"
import { cn } from "@/lib/utils"

export interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function Dialog({
  isOpen,
  onClose,
  title,
  description,
  children,
  className
}: DialogProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden"
      window.addEventListener("keydown", handleKeyDown)
    }
    return () => {
      document.body.style.overflow = "unset"
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const titleId = React.useId()
  const descId = React.useId()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descId : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full max-w-lg bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl text-stone-100 animate-in zoom-in-95 duration-200",
          className
        )}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="absolute top-4 right-4 w-8 h-8 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors flex items-center justify-center font-bold text-sm"
        >
          ✕
        </button>

        {title && (
          <h3 id={titleId} className="text-xl font-bold text-amber-400 mb-1">
            {title}
          </h3>
        )}

        {description && (
          <p id={descId} className="text-stone-400 text-sm mb-4">
            {description}
          </p>
        )}

        {children}
      </div>
    </div>
  )
}
