'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { devError } from '@/lib/debug'
import { formatCurrency } from '@/lib/format'
import { useAppTour } from '@/hooks/useAppTour'

type Material = {
  id: string
  name: string
  unit: string
  price_per_unit: number
}

type SubRecipeIngredient = {
  material_id: string
  quantity: number
}

type SubRecipe = {
  id: string
  name: string
  yield_quantity: number
  yield_unit: string
  wastage_percent: number
  calculated_cost?: number
  cost_per_yield?: number
  ingredients?: SubRecipeIngredient[]
}

export default function YariMamuller() {
  const { showConfirm } = useNotification()
  useAppTour('yari_mamuller', [
    {
      element: '#tour-subrecipes-create',
      popover: { title: 'Üretim reçetesi oluşturun', description: 'Tepsi, tencere veya sos üretimi için verim ve fire bilgisini buradan girin.' }
    },
    {
      element: '#tour-subrecipes-search',
      popover: { title: 'Reçeteyi hızla bulun', description: 'Büyüyen üretim listenizi ad ile arayarak doğru reçeteye ulaşın.' }
    },
    {
      element: '#tour-subrecipes-kpis',
      popover: { title: 'Porsiyon maliyetini yönetin', description: 'Ortalama maliyet ve fire oranı, üretim verimliliğini tek ekranda görünür kılar.' }
    }
  ])
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const [form, setForm] = useState({
    name: '',
    yield_quantity: '',
    yield_unit: 'Porsiyon',
    wastage_percent: '5'
  })
  const [ingredients, setIngredients] = useState<SubRecipeIngredient[]>([])

  const supabase = useMemo(() => createClient(), [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const { data: mats } = await supabase.from('materials').select('*').order('name')
    setMaterials(mats || [])

    const { data: recipes } = await supabase.from('sub_recipes').select('*').order('name')
    if (recipes && recipes.length > 0) {
      const { data: recipeIngs } = await supabase.from('sub_recipe_ingredients').select('*')
      const recipesWithCost = recipes.map(r => {
        const myIngs = recipeIngs?.filter(i => i.sub_recipe_id === r.id) || []
        let totalCost = 0
        myIngs.forEach(ing => {
          const mat = mats?.find(m => m.id === ing.material_id)
          if (mat) totalCost += mat.price_per_unit * ing.quantity
        })
        const finalCostWithWastage = totalCost * (1 + r.wastage_percent / 100)
        const costPerYield = r.yield_quantity > 0 ? finalCostWithWastage / r.yield_quantity : 0
        return {
          ...r,
          calculated_cost: totalCost,
          cost_per_yield: costPerYield,
          ingredients: myIngs.map(i => ({ material_id: i.material_id, quantity: i.quantity }))
        }
      })
      setSubRecipes(recipesWithCost)
    } else {
      setSubRecipes([])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchData()
    }, 0)
    return () => window.clearTimeout(id)
  }, [fetchData])

  const resetForm = () => {
    setForm({ name: '', yield_quantity: '', yield_unit: 'Porsiyon', wastage_percent: '5' })
    setIngredients([])
    setEditingId(null)
    setShowModal(false)
  }

  const addIngredient = () => setIngredients([...ingredients, { material_id: '', quantity: 0 }])

  const updateIngredient = (index: number, field: string, value: string | number) => {
    const updated = [...ingredients]
    updated[index] = { ...updated[index], [field]: value }
    setIngredients(updated)
  }

  const removeIngredient = (index: number) => setIngredients(ingredients.filter((_, i) => i !== index))

  const calculateLiveCost = () => {
    let total = 0
    ingredients.forEach(item => {
      const mat = materials.find(m => m.id === item.material_id)
      if (mat && item.quantity) total += mat.price_per_unit * item.quantity
    })
    return total
  }

  const handleSubmit = async () => {
    if (!form.name || !form.yield_quantity) return
    const payload = {
      name: form.name,
      yield_quantity: parseFloat(form.yield_quantity),
      yield_unit: form.yield_unit,
      wastage_percent: parseFloat(form.wastage_percent || '0')
    }
    let recipeId = editingId
    let details = ''

    if (editingId) {
      const oldRecipe = subRecipes.find(r => r.id === editingId)
      const changes = []
      if (oldRecipe?.yield_quantity !== payload.yield_quantity)
        changes.push(`Çıkan Adet: ${oldRecipe?.yield_quantity} -> ${payload.yield_quantity}`)
      if (oldRecipe?.yield_unit !== payload.yield_unit)
        changes.push(`Birim: ${oldRecipe?.yield_unit} -> ${payload.yield_unit}`)
      if (oldRecipe?.wastage_percent !== payload.wastage_percent)
        changes.push(`Fire: %${oldRecipe?.wastage_percent} -> %${payload.wastage_percent}`)
      details = changes.length > 0 ? changes.join(', ') : 'Reçete içeriği veya isim güncellendi'

      await supabase.from('sub_recipes').update(payload).eq('id', editingId)
      await supabase.from('sub_recipe_ingredients').delete().eq('sub_recipe_id', editingId)
    } else {
      details = `Verim: ${payload.yield_quantity} ${payload.yield_unit}, Fire: %${payload.wastage_percent}`
      const { data, error } = await supabase.from('sub_recipes').insert(payload).select().single()
      if (error) {
        devError(error)
        return
      }
      recipeId = data?.id
    }

    if (recipeId && ingredients.length > 0) {
      const validItems = ingredients.filter(i => i.material_id && i.quantity > 0)
      if (validItems.length > 0) {
        await supabase.from('sub_recipe_ingredients').insert(
          validItems.map(i => ({ sub_recipe_id: recipeId, material_id: i.material_id, quantity: i.quantity }))
        )
      }
    }

    resetForm()
    fetchData()
    logActivity(
      'Üretim Reçetesi',
      editingId ? 'GUNCELLEME' : 'EKLEME',
      `${form.name} isimli üretim reçetesi ${editingId ? 'güncellendi' : 'sisteme eklendi'}.`,
      { detay: details }
    )
  }

  const handleEdit = async (recipe: SubRecipe) => {
    setForm({
      name: recipe.name,
      yield_quantity: recipe.yield_quantity.toString(),
      yield_unit: recipe.yield_unit,
      wastage_percent: recipe.wastage_percent.toString()
    })
    setEditingId(recipe.id)

    const { data } = await supabase
      .from('sub_recipe_ingredients')
      .select('*')
      .eq('sub_recipe_id', recipe.id)
    setIngredients(data?.map(i => ({ material_id: i.material_id, quantity: i.quantity })) || [])
    setShowModal(true)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm(
      'Bu üretim reçetesini silmek istediğinize emin misiniz?',
      'Üretim Reçetesini Sil 🗑️'
    )
    if (!confirmed) return
    await supabase.from('sub_recipes').delete().eq('id', id)
    fetchData()
    logActivity('Üretim Reçetesi', 'SILME', `Bir üretim reçetesi sistemden silindi.`, { recipeId: id })
  }

  const liveCost = calculateLiveCost()
  const liveWastagePercent = parseFloat(form.wastage_percent || '0')
  const liveCostWithWastage = liveCost * (1 + liveWastagePercent / 100)
  const liveYieldQuantity = parseFloat(form.yield_quantity || '1')
  const liveCostPerYield = liveYieldQuantity > 0 ? liveCostWithWastage / liveYieldQuantity : 0

  // ─── Computed Stats ──────────────────────────────────────────
  const averagePortionCost = useMemo(() => {
    if (subRecipes.length === 0) return 0
    const total = subRecipes.reduce((sum, r) => sum + (r.cost_per_yield || 0), 0)
    return total / subRecipes.length
  }, [subRecipes])

  const averageWastagePercent = useMemo(() => {
    if (subRecipes.length === 0) return 0
    const total = subRecipes.reduce((sum, r) => sum + (r.wastage_percent || 0), 0)
    return total / subRecipes.length
  }, [subRecipes])

  const totalUsedMaterialsCount = useMemo(() => {
    const matSet = new Set<string>()
    subRecipes.forEach(r => {
      r.ingredients?.forEach(i => matSet.add(i.material_id))
    })
    return matSet.size
  }, [subRecipes])

  const filteredSubRecipes = useMemo(() => {
    if (!search.trim()) return subRecipes
    const query = search.toLowerCase()
    return subRecipes.filter(r => r.name.toLowerCase().includes(query))
  }, [subRecipes, search])

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-16">
      {/* ──────────────── HEADER BAR ──────────────── */}
      <header className="bg-stone-900/90 backdrop-blur-xl border-b border-stone-800/80 sticky top-0 z-30 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-2xl text-amber-400 shadow-inner">
              🥣
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-xl sm:text-2xl text-white tracking-tight">Üretim Reçeteleri</h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700">
                  Yarı Mamüller
                </span>
              </div>
              <p className="text-stone-400 text-xs mt-0.5">
                Toplu üretim (tepsi/tencere) reçeteleri, verim porsiyonları, fire payları ve porsiyon maliyetleri.
              </p>
            </div>
          </div>

          <button
            id="tour-subrecipes-create"
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95 whitespace-nowrap"
          >
            <span>➕</span>
            <span>Yeni Üretim Reçetesi</span>
          </button>
        </div>
      </header>

      {/* ──────────────── MAIN CONTAINER ──────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {/* EXECUTIVE KPI METRIC CARDS */}
        <div id="tour-subrecipes-kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Toplam Üretim Reçetesi</span>
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 text-base">
                🥣
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">{subRecipes.length} Reçete</div>
            <div className="text-stone-400 text-[11px] mt-1">Aktif Yarı Mamül Reçetesi</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Ortalama Porsiyon Maliyeti</span>
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-base">
                💰
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-amber-400">
              {formatCurrency(averagePortionCost)}
            </div>
            <div className="text-stone-400 text-[11px] mt-1">Porsiyon Başına Ort. Maliyet</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Ortalama Fire Oranı</span>
              <span className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-base">
                🔥
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-rose-400">
              %{averageWastagePercent.toFixed(1)}
            </div>
            <div className="text-stone-400 text-[11px] mt-1">Üretim Fire Kayıp Payı</div>
          </div>

          <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-xl relative overflow-hidden group">
            <div className="flex justify-between items-start mb-2">
              <span className="text-stone-400 text-xs font-semibold">Kullanılan Hammaddeler</span>
              <span className="p-2 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/20 text-base">
                📦
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black text-violet-400">
              {totalUsedMaterialsCount} Çeşit
            </div>
            <div className="text-stone-400 text-[11px] mt-1">Reçete İçi Hammadde Çeşidi</div>
          </div>
        </div>

        {/* SEARCH BAR */}
        <div id="tour-subrecipes-search" className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-3.5 sm:p-4 shadow-xl flex items-center justify-between gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Üretim reçetesi adı ile arama yapın..."
              className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-4 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-amber-500/50 transition-colors placeholder:text-stone-600"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ──────────────── RECIPES LIST TABLE / CARDS ──────────────── */}
        {loading ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-400 backdrop-blur-md">
            <div className="animate-spin text-amber-500 text-3xl mb-3">🥣</div>
            <p className="text-sm font-medium">Üretim Reçeteleri Yükleniyor...</p>
          </div>
        ) : filteredSubRecipes.length === 0 ? (
          <div className="bg-stone-900/60 border border-stone-800 rounded-2xl p-16 text-center text-stone-500 backdrop-blur-md">
            <div className="text-5xl mb-3">🥣</div>
            <h3 className="text-lg font-bold text-stone-300 mb-1">Henüz Üretim Reçetesi Eklemediniz</h3>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              Tepsi tatlıları, soslar veya toplu pişirilen yarı mamülleri &quot;+ Yeni Üretim Reçetesi&quot; butonuna basarak ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="bg-stone-900/80 border border-stone-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-xl">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-950/60 border-b border-stone-800 text-stone-400 text-[11px] uppercase tracking-wider font-semibold">
                    <th className="px-5 py-3.5">Üretim Reçetesi Adı</th>
                    <th className="px-4 py-3.5 text-right">Toplam (Fire Dahil) Maliyet</th>
                    <th className="px-4 py-3.5 text-right">Çıkan Verim Miktarı</th>
                    <th className="px-4 py-3.5 text-right">Porsiyon Maliyeti</th>
                    <th className="px-5 py-3.5 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50 text-xs sm:text-sm">
                  {filteredSubRecipes.map(r => {
                    const finalCostWithWastage = (r.calculated_cost || 0) * (1 + r.wastage_percent / 100)
                    return (
                      <tr key={r.id} className="hover:bg-stone-800/30 transition-colors">
                        <td className="px-5 py-3.5 font-bold text-stone-100 flex items-center gap-2">
                          <span>{r.name}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-stone-200">
                          {formatCurrency(finalCostWithWastage)}
                          <span className="text-[10px] text-rose-400 ml-1.5 font-semibold">
                            (%{r.wastage_percent} fire)
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right text-stone-400 font-semibold">
                          {r.yield_quantity} {r.yield_unit}
                        </td>
                        <td className="px-4 py-3.5 text-right font-black text-amber-400 text-sm sm:text-base">
                          {formatCurrency(r.cost_per_yield || 0)}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(r)}
                              className="p-1.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-lg border border-stone-700 transition-colors active:scale-95"
                              title="Düzenle"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(r.id)}
                              className="p-1.5 bg-stone-800 hover:bg-rose-500/20 text-stone-400 hover:text-rose-400 rounded-lg border border-stone-700 hover:border-rose-500/30 transition-colors active:scale-95"
                              title="Sil"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="md:hidden divide-y divide-stone-800/60">
              {filteredSubRecipes.map(r => {
                const finalCostWithWastage = (r.calculated_cost || 0) * (1 + r.wastage_percent / 100)
                return (
                  <div key={r.id} className="p-4 space-y-3 hover:bg-stone-800/20 transition-colors">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm sm:text-base flex items-center gap-2">
                        <span>{r.name}</span>
                      </h4>
                      <span className="text-amber-400 font-black text-base">
                        {formatCurrency(r.cost_per_yield || 0)} / {r.yield_unit}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-stone-950/60 p-2.5 rounded-xl border border-stone-800/60 text-xs">
                      <div>
                        <span className="text-stone-400 block text-[10px]">Toplam Maliyet (Fire Dahil)</span>
                        <span className="font-bold text-stone-200">
                          {formatCurrency(finalCostWithWastage)}
                          <span className="text-[10px] text-rose-400 ml-1">(%{r.wastage_percent})</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[10px]">Çıkan Verim Miktarı</span>
                        <span className="font-extrabold text-white">
                          {r.yield_quantity} {r.yield_unit}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => handleEdit(r)}
                        className="px-3 py-1.5 bg-stone-800 text-stone-200 hover:text-white rounded-xl text-xs font-semibold border border-stone-700"
                      >
                        ✏️ Düzenle
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="px-3 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl text-xs font-semibold border border-rose-500/20"
                      >
                        🗑️ Sil
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>

      {/* ──────────────── PRODUCTION RECIPE FORM MODAL ──────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 bg-stone-950/90 backdrop-blur-md z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
          onClick={() => resetForm()}
        >
          <div
            className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-3xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden relative my-auto"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 bg-stone-950 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg">
                  {editingId ? '✏️' : '🥣'}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base sm:text-lg">
                    {editingId ? `${form.name || 'Reçete'} Düzenle` : 'Yeni Üretim Reçetesi (Tepsi/Tencere)'}
                  </h3>
                  <p className="text-stone-400 text-xs">
                    Reçeteye hammadde ekleyerek porsiyon maliyetinizi otomatik hesaplatın.
                  </p>
                </div>
              </div>
              <button
                onClick={() => resetForm()}
                className="text-stone-400 hover:text-white p-2 rounded-xl bg-stone-800/80 border border-stone-700/80 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Reçete / Mamül Adı *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="örn: Tepsi Profiterol / Tencere Çikolata Sosu"
                  />
                </div>

                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Çıkan Adet / Miktar *</label>
                  <input
                    type="number"
                    value={form.yield_quantity}
                    onChange={e => setForm({ ...form, yield_quantity: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-500/50"
                    placeholder="10"
                  />
                </div>

                <div>
                  <label className="text-stone-300 text-xs font-semibold mb-1 block">Porsiyon Birimi</label>
                  <select
                    value={form.yield_unit}
                    onChange={e => setForm({ ...form, yield_unit: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="Porsiyon">Porsiyon</option>
                    <option value="Dilim">Dilim</option>
                    <option value="Kg">Kg</option>
                    <option value="Litre">Litre</option>
                    <option value="Adet">Adet</option>
                  </select>
                </div>

                <div>
                  <label className="text-rose-400 text-xs font-semibold mb-1 block">Fire Payı (%)</label>
                  <input
                    type="number"
                    value={form.wastage_percent}
                    onChange={e => setForm({ ...form, wastage_percent: e.target.value })}
                    className="w-full bg-stone-950 border border-rose-500/30 rounded-xl px-3 py-2 text-rose-400 font-bold text-sm focus:outline-none focus:border-rose-500/50"
                    placeholder="5"
                  />
                </div>
              </div>

              {/* Ingredients List */}
              <div className="bg-stone-950/80 p-4 rounded-2xl border border-stone-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-amber-400 text-xs sm:text-sm flex items-center gap-1.5">
                    <span>🥣</span>
                    <span>Reçete İçerik Malzemeleri ({ingredients.length})</span>
                  </h4>
                  <button
                    onClick={addIngredient}
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95"
                  >
                    + Hammadde Ekle
                  </button>
                </div>

                {ingredients.length === 0 ? (
                  <div className="text-center py-6 text-stone-500 text-xs">
                    Henüz reçeteye hammadde eklenmedi. Yukarıdaki &quot;+ Hammadde Ekle&quot; butonunu kullanın.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {ingredients.map((item, index) => (
                      <div key={index} className="grid grid-cols-12 gap-2 items-center bg-stone-900 p-2 rounded-xl border border-stone-800">
                        <div className="col-span-7">
                          <select
                            value={item.material_id}
                            onChange={e => updateIngredient(index, 'material_id', e.target.value)}
                            className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-amber-500/50"
                          >
                            <option value="">Hammadde seçiniz...</option>
                            {materials.map(mat => (
                              <option key={mat.id} value={mat.id}>
                                {mat.name} ({mat.unit}) - ₺{mat.price_per_unit}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-4">
                          <input
                            type="number"
                            value={item.quantity || ''}
                            onChange={e => updateIngredient(index, 'quantity', parseFloat(e.target.value))}
                            className="w-full bg-stone-950 border border-stone-800 rounded-lg px-2.5 py-1.5 text-white font-bold text-xs text-right focus:outline-none focus:border-amber-500/50"
                            placeholder="Miktar"
                          />
                        </div>
                        <div className="col-span-1 text-center">
                          <button
                            onClick={() => removeIngredient(index)}
                            className="text-stone-500 hover:text-rose-400 p-1 transition-colors"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Cost Summary Box */}
              {ingredients.length > 0 && (
                <div className="grid grid-cols-3 gap-3 bg-stone-950 p-4 rounded-2xl border border-amber-500/30 text-center">
                  <div>
                    <span className="text-stone-400 text-[10px] block uppercase font-bold">Çıplak Maliyet</span>
                    <span className="text-white font-extrabold text-sm sm:text-base">
                      {formatCurrency(liveCost)}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 text-[10px] block uppercase font-bold">Fire Dahil Maliyet</span>
                    <span className="text-rose-400 font-extrabold text-sm sm:text-base">
                      {formatCurrency(liveCostWithWastage)}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-400 text-[10px] block uppercase font-bold">1 {form.yield_unit} Maliyeti</span>
                    <span className="text-amber-400 font-black text-base sm:text-lg">
                      {formatCurrency(liveCostPerYield)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="px-6 py-4 bg-stone-950 border-t border-stone-800 flex justify-end gap-3">
              <button
                onClick={() => resetForm()}
                className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-5 py-2 rounded-xl text-xs font-semibold border border-stone-700 transition-colors"
              >
                İptal
              </button>
              <button
                onClick={handleSubmit}
                className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold px-6 py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
              >
                {editingId ? 'Reçeteyi Güncelle' : 'Reçeteyi Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
