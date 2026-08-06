export function InvestmentPageHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="mb-8 flex flex-col items-start justify-between gap-4 p-6 pb-0 md:flex-row md:items-center">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-bold text-amber-500">📈 Yatırımlar ve Portföy</h1>
        <p className="mt-2 max-w-2xl text-stone-400">
          İşletmenizin varlıklarını döviz, altın ve gayrimenkul olarak koruyun; güncel değerlerini ve kira getirilerini
          takip edin.
        </p>
      </div>
      <button
        id="tour-inv-add"
        type="button"
        onClick={onCreate}
        className="whitespace-nowrap rounded-xl bg-amber-500 px-6 py-3 font-bold text-stone-950 shadow-[0_0_20px_rgba(245,158,11,0.2)] transition-colors hover:bg-amber-400"
      >
        + Yeni Yatırım Yap
      </button>
    </header>
  )
}
