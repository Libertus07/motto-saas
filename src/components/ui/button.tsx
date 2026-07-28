import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 disabled:pointer-events-none disabled:opacity-50 min-h-[44px] min-w-[44px] cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-amber-500 text-stone-950 hover:bg-amber-400 active:bg-amber-600 shadow-md shadow-amber-500/20 border border-amber-400/30",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 shadow-md shadow-rose-600/20 border border-rose-500/30",
        outline:
          "border border-stone-700 bg-stone-900/80 text-stone-200 hover:bg-stone-800 hover:text-white border-stone-700",
        secondary:
          "bg-stone-800 text-stone-200 hover:bg-stone-700 hover:text-white border border-stone-700/60",
        ghost:
          "hover:bg-stone-800 hover:text-stone-100 text-stone-300",
        link: "text-amber-400 underline-offset-4 hover:underline min-h-0 min-w-0 p-0",
      },
      size: {
        default: "px-4 py-2.5 text-sm",
        sm: "h-9 rounded-lg px-3 text-xs min-h-[36px]",
        lg: "h-12 rounded-xl px-6 text-base min-h-[48px]",
        icon: "h-11 w-11 p-0 flex items-center justify-center rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
