'use client'

import { useState, useEffect, Fragment } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'

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
}

export default function YariMamuller() {
  const { showConfirm } = useNotification()
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    yield_quantity: '',
    yield_unit: 'Porsiyon',
    wastage_percent: '5',
  })
  const [ingredients, setIngredients] = useState<SubRecipeIngredient[]>([])

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
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
        return { ...r, calculated_cost: totalCost, cost_per_yield: costPerYield }
      })
      setSubRecipes(recipesWithCost)
    } else {
      setSubRecipes([])
    }
    setLoading(false)
  }

  const resetForm = () => {
    setForm({ name: '', yield_quantity: '', yield_unit: 'Porsiyon', wastage_percent: '5' })
    setIngredients([])
    setEditingId(null)
    setShowForm(false)
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
      wastage_percent: parseFloat(form.wastage_percent || '0'),
    }
    let recipeId = editingId
    let details = ''
    if (editingId) {
      const oldRecipe = subRecipes.find(r => r.id === editingId)
      const changes = []
      if (oldRecipe?.yield_quantity !== payload.yield_quantity) changes.push(`Çıkan Adet: ${oldRecipe?.yield_quantity} -> ${payload.yield_quantity}`)
      if (oldRecipe?.yield_unit !== payload.yield_unit) changes.push(`Birim: ${oldRecipe?.yield_unit} -> ${payload.yield_unit}`)
      if (oldRecipe?.wastage_percent !== payload.wastage_percent) changes.push(`Fire: %${oldRecipe?.wastage_percent} -> %${payload.wastage_percent}`)
      details = changes.length > 0 ? changes.join(', ') : 'Reçete içeriği veya isim güncellendi'

      await supabase.from('sub_recipes').update(payload).eq('id', editingId)
      await supabase.from('sub_recipe_ingredients').delete().eq('sub_recipe_id', editingId)
    } else {
      details = `Verim: ${payload.yield_quantity} ${payload.yield_unit}, Fire: %${payload.wastage_percent}`
      const { data, error } = await supabase.from('sub_recipes').insert(payload).select().single()
      if (error) { console.error(error); return }
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
    resetForm(); fetchData()
    logActivity('Üretim Reçetesi', editingId ? 'GUNCELLEME' : 'EKLEME', `${form.name} isimli üretim reçetesi ${editingId ? 'güncellendi' : 'sisteme eklendi'}.`, { detay: details })
  }

  const handleEdit = async (recipe: SubRecipe) => {
    setForm({
      name: recipe.name,
      yield_quantity: recipe.yield_quantity.toString(),
      yield_unit: recipe.yield_unit,
      wastage_percent: recipe.wastage_percent.toString()
    })
    setEditingId(recipe.id)
    setShowForm(false) // Üst formu kapat, inline açılacak

    const { data } = await supabase
      .from('sub_recipe_ingredients')
      .select('*')
      .eq('sub_recipe_id', recipe.id)
    setIngredients(data?.map(i => ({ material_id: i.material_id, quantity: i.quantity })) || [])
  }

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('Bu üretim reçetesini silmek istediğinize emin misiniz?', 'Üretim Reçetesini Sil 🗑️')
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

  // Düzenleme formu — hem üstte (yeni) hem inline (düzenleme) için
  const renderForm = (isInline = false) => (
    <div className={isInline ? '' : 'bg-stone-900 border border-amber-400 rounded-xl p-6 mb-6'}>
      {!isInline && (
        <h2 className="font-bold text-lg mb-4">Yeni Üretim Reçetesi (Tepsi/Tencere) Ekle</h2>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-1">
          <label className="text-stone-400 text-sm mb-1 block">Üretim Reçetesi Adı *</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" placeholder="örn: Tepsi Profiterol" />
        </div>
        <div>
          <label className="text-stone-400 text-sm mb-1 block">Çıkan Adet/Porsiyon *</label>
          <input type="number" value={form.yield_quantity} onChange={e => setForm({ ...form, yield_quantity: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" placeholder="10" />
        </div>
        <div>
          <label className="text-stone-400 text-sm mb-1 block">Porsiyon Birimi</label>
          <select value={form.yield_unit} onChange={e => setForm({ ...form, yield_unit: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400">
            <option value="Porsiyon">Porsiyon</option>
            <option value="Dilim">Dilim</option>
            <option value="Kg">Kg</option>
            <option value="Litre">Litre</option>
          </select>
        </div>
        <div>
          <label className="text-stone-400 text-sm mb-1 block">Fire Payı (%)</label>
          <input type="number" value={form.wastage_percent} onChange={e => setForm({ ...form, wastage_percent: e.target.value })} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400" placeholder="5" />
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-amber-400">İçerik (Reçete)</h3>
          <button onClick={addIngredient} className="text-amber-400 hover:text-amber-300 text-sm border border-amber-400 px-3 py-1 rounded-lg">+ Hammadde Ekle</button>
        </div>
        {ingredients.length === 0 ? (
          <p className="text-stone-500 text-sm">Henüz hammadde eklenmedi.</p>
        ) : (
          <div className="space-y-2">
            {ingredients.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6">
                  <select value={item.material_id} onChange={e => updateIngredient(index, 'material_id', e.target.value)} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400">
                    <option value="">Hammadde seç</option>
                    {materials.map(mat => <option key={mat.id} value={mat.id}>{mat.name} ({mat.unit}) - ₺{mat.price_per_unit}</option>)}
                  </select>
                </div>
                <div className="col-span-5">
                  <input type="number" value={item.quantity || ''} onChange={e => updateIngredient(index, 'quantity', parseFloat(e.target.value))} className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400" placeholder="Kullanılan Miktar" />
                </div>
                <div className="col-span-1 text-center">
                  <button onClick={() => removeIngredient(index)} className="text-red-400 hover:text-red-300">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {ingredients.length > 0 && (
        <div className="bg-stone-800 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><span className="text-stone-400 text-sm block">Toplam Çıplak Maliyet</span><span className="text-white font-bold">₺{liveCost.toFixed(2)}</span></div>
          <div><span className="text-stone-400 text-sm block">Fire Dahil Toplam Maliyet</span><span className="text-red-400 font-bold">₺{liveCostWithWastage.toFixed(2)}</span></div>
          <div><span className="text-stone-400 text-sm block">1 {form.yield_unit} Maliyeti</span><span className="text-amber-400 font-bold text-lg">₺{liveCostPerYield.toFixed(2)}</span></div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={handleSubmit} className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2 rounded-lg transition-colors">
          {editingId ? 'Güncelle' : 'Kaydet'}
        </button>
        <button onClick={resetForm} className="bg-stone-700 hover:bg-stone-600 text-white px-6 py-2 rounded-lg transition-colors">İptal</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-full bg-stone-950 text-white">
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🥣</span>
          <h1 className="font-bold text-amber-400">Üretim Reçeteleri</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Yeni Üretim Reçetesi
        </button>
      </header>

      <main className="p-6">
        {/* Üst Form — Sadece Yeni Ekleme için */}
        {showForm && !editingId && renderForm(false)}

        {loading ? (
          <p className="text-stone-400">Yükleniyor...</p>
        ) : subRecipes.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <div className="text-5xl mb-4">🥣</div>
            <p>Henüz üretim reçetesi eklenmemiş.</p>
            <p className="text-sm mt-1">Örneğin kendi yaptığınız pastaları buradan tepsi bazlı girebilirsiniz.</p>
          </div>
        ) : (
          <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
            <div className="overflow-x-auto w-full">
<table className="w-full">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Üretim Reçetesi Adı</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Toplam (Fire Dahil) Maliyet</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Çıkan Porsiyon</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Porsiyon Maliyeti</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {subRecipes.map((r, i) => (
                  <Fragment key={r.id}>
                    <tr className={`border-b border-stone-800 transition-colors ${editingId === r.id ? 'bg-amber-900/20' : i % 2 === 0 ? 'hover:bg-stone-800' : 'bg-stone-900 hover:bg-stone-800'}`}>
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-right text-stone-300">
                        ₺{((r.calculated_cost || 0) * (1 + r.wastage_percent / 100)).toFixed(2)}
                        <span className="text-xs text-red-400 ml-1">(%{r.wastage_percent} fire)</span>
                      </td>
                      <td className="px-4 py-3 text-right text-stone-400">{r.yield_quantity} {r.yield_unit}</td>
                      <td className="px-4 py-3 text-right text-amber-400 font-bold">₺{r.cost_per_yield?.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => editingId === r.id ? resetForm() : handleEdit(r)}
                          className={`text-sm mr-3 font-medium ${editingId === r.id ? 'text-amber-400' : 'text-blue-400 hover:text-blue-300'}`}
                        >
                          {editingId === r.id ? 'Kapat' : 'Düzenle'}
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="text-red-400 hover:text-red-300 text-sm">Sil</button>
                      </td>
                    </tr>
                    {editingId === r.id && (
                      <tr>
                        <td colSpan={5} className="p-4 bg-stone-950/80 border-b-2 border-amber-500/40">
                          <div className="bg-stone-900 border border-amber-400/60 rounded-xl p-5">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="font-bold text-amber-400">✏️ {r.name} Düzenle</h3>
                              <button onClick={resetForm} className="text-stone-500 hover:text-white text-lg">✕</button>
                            </div>
                            {renderForm(true)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
</div>
          </div>
        )}
      </main>
    </div>
  )
}
