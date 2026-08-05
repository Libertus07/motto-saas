import { Input } from '@/components/ui/input'

type SalesQuantityControlProps = {
  productId: string
  value: number
  compact?: boolean
  onChange: (productId: string, field: 'dailySales', value: number) => void
  onAdjust: (productId: string, delta: number) => void
}

export function SalesQuantityControl({ productId, value, compact, onChange, onAdjust }: SalesQuantityControlProps) {
  const negativeDeltas = compact ? [-1] : [-5, -1]
  const positiveDeltas = compact ? [1] : [1, 5]
  const buttonClass = `${compact ? 'h-7 w-7' : 'px-2 py-0.5'} rounded border border-stone-700 bg-stone-800 text-xs font-bold text-stone-300 transition-colors hover:bg-stone-700`
  return (
    <div className="flex items-center justify-center gap-1.5">
      {negativeDeltas.map((delta) => (
        <button
          type="button"
          key={delta}
          onClick={() => onAdjust(productId, delta)}
          className={buttonClass}
          aria-label={`${Math.abs(delta)} adet azalt`}
        >
          {delta}
        </button>
      ))}
      <Input
        type="number"
        min="0"
        inputMode="numeric"
        value={value || ''}
        onChange={(event) =>
          onChange(productId, 'dailySales', Math.max(0, Number.parseInt(event.target.value, 10) || 0))
        }
        aria-label="Günlük satış adedi"
        className="h-8 w-16 px-1 text-center text-xs font-bold"
      />
      {positiveDeltas.map((delta) => (
        <button
          type="button"
          key={delta}
          onClick={() => onAdjust(productId, delta)}
          className={buttonClass}
          aria-label={`${delta} adet artır`}
        >
          +{delta}
        </button>
      ))}
    </div>
  )
}
