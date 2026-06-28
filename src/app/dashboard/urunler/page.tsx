'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Ingredient = {
  id: string
  name: string
  unit: string
  unit_price: number
}

type RecipeItem = {
  ingredient_id: string
  quantity: number
  waste_percentage: number
}

type Product = {
  id: string
  name: string
  category: string
  selling_price: number
  calculated_cost: number
  suggested_price: number
  is_active: boolean
}

export default function Urunler() {
  const [products, setProducts] = useState<Product[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', category: 'kahve', selling_price: '' })
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([])
  const supabase = createClient()
  const router = useRouter()

  const categories = ['kahve', 'soguk_icecek', 'sicak_icecek', 'pasta', 'tatli', 'diger']

  useEffect(() => {
    fetchProducts()
    fetchIngredients()
  }, [])

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*').order('name')
    setProducts(data || [])
    setLoading(false)
  }

  const fetchIngredients = async () => {
    const { data } = await supabase.from('ingredients').select('*').order('name')
    setIngredients(data || [])
  }

  const resetForm = () => {
    setForm({ name: '', category: 'kahve', selling_price: '' })
    setRecipeItems([])
    setEditingId(null)
    setShowForm(false)
  }

  const addRecipeItem = () => {
    setRecipeItems([...recipeItems, { ingredient_id: '', quantity: 0, waste_percentage: 0 }])
  }

  const updateRecipeItem = (index: number, field: string, value: string | number) => {
    const updated = [...recipeItems]
    updated[index] = { ...updated[index], [field]: value }
    setRecipeItems(updated)
  }

  const removeRecipeItem = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index))
  }

  // Maliyet hesaplama
  const calculateCost = () => {
    return recipeItems.reduce((total, item) => {
      const ingredient = ingredients.find(i => i.id === item.ingredient_id)
      if (!ingredient || !item.quantity) return total
      const rawCost = ingredient.unit_price * item.quantity
      const withWaste = rawCost * (1 + item.waste_percentage / 100)
      return total + withWaste
    }, 0)
  }

  const handleSubmit = async () => {
    if (!form.name) return

    const calculatedCost = calculateCost()

    const payload = {
      name: form.name,
      category: form.category,
      selling_price: parseFloat(form.selling_price || '0'),
      calculated_cost: calculatedCost,
    }

    let productId = editingId

    if (editingId) {
      await supabase.from('products').update(payload).eq('id', editingId)
      await supabase.from('recipes').delete().eq('product_id', editingId)
    } else {
      const { data } = await supabase.from('products').insert(payload).select().single()
      productId = data?.id
    }

    // Reçete kaydet
    if (productId && recipeItems.length > 0) {
      const validItems = recipeItems.filter(r => r.ingredient_id && r.quantity > 0)
      await supabase.from('recipes').insert(
        validItems.map(r => ({ product_id: productId, ...r }))
      )
    }

    resetForm()
    fetchProducts()
  }

  const handleEdit = async (product: Product) => {
    setForm({
      name: product.name,
      category: product.category,
      selling_price: product.selling_price.toString()
    })
    setEditingId(product.id)

    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('product_id', product.id)

    setRecipeItems(data?.map(r => ({
      ingredient_id: r.ingredient_id,
      quantity: r.quantity,
      waste_percentage: r.waste_percentage
    })) || [])

    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return
    await supabase.from('recipes').delete().eq('product_id', id)
    await supabase.from('products').delete().eq('id', id)
    fetchProducts()
  }

  const getMargin = (product: Product) => {
    if (!product.selling_price || !product.calculated_cost) return null
    return ((product.selling_price - product.calculated_cost) / product.selling_price * 100).toFixed(1)
  }

  const liveCost = calculateCost()

  return (
    <div className="min-h-screen bg-stone-950 text-white">

      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-stone-400 hover:text-white">← Geri</button>
          <span className="text-stone-600">|</span>
          <span className="text-2xl">📋</span>
          <h1 className="font-bold text-amber-400">Ürünler & Reçeteler</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Yeni Ürün
        </button>
      </header>

      <main className="p-6">

        {/* Form */}
        {showForm && (
          <div className="bg-stone-900 border border-amber-400 rounded-xl p-6 mb-6">
            <h2 className="font-bold text-lg mb-4">
              {editingId ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}
            </h2>

            {/* Ürün Bilgileri */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Ürün Adı *</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="örn: Cappuccino"
                />
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Kategori</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Satış Fiyatı (₺)</label>
                <input
                  type="number"
                  value={form.selling_price}
                  onChange={e => setForm({ ...form, selling_price: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Reçete */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-amber-400">Reçete</h3>
                <button
                  onClick={addRecipeItem}
                  className="text-amber-400 hover:text-amber-300 text-sm border border-amber-400 px-3 py-1 rounded-lg"
                >
                  + Hammadde Ekle
                </button>
              </div>

              {recipeItems.length === 0 ? (
                <p className="text-stone-500 text-sm">Henüz hammadde eklenmedi.</p>
              ) : (
                <div className="space-y-2">
                  {recipeItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <select
                          value={item.ingredient_id}
                          onChange={e => updateRecipeItem(index, 'ingredient_id', e.target.value)}
                          className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                        >
                          <option value="">Hammadde seç</option>
                          {ingredients.map(ing => (
                            <option key={ing.id} value={ing.id}>
                              {ing.name} ({ing.unit})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          value={item.quantity || ''}
                          onChange={e => updateRecipeItem(index, 'quantity', parseFloat(e.target.value))}
                          className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                          placeholder="Miktar"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          value={item.waste_percentage || ''}
                          onChange={e => updateRecipeItem(index, 'waste_percentage', parseFloat(e.target.value))}
                          className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                          placeholder="Fire %"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button onClick={() => removeRecipeItem(index)} className="text-red-400 hover:text-red-300">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Canlı Maliyet */}
            {recipeItems.length > 0 && (
              <div className="bg-stone-800 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-stone-400">Hesaplanan Ham Maliyet:</span>
                  <span className="text-amber-400 font-bold text-lg">₺{liveCost.toFixed(2)}</span>
                </div>
                {form.selling_price && (
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-stone-400">Brüt Kar Marjı:</span>
                    <span className={`font-bold ${parseFloat(form.selling_price) > liveCost ? 'text-green-400' : 'text-red-400'}`}>
                      %{((parseFloat(form.selling_price) - liveCost) / parseFloat(form.selling_price) * 100).toFixed(1)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-6 py-2 rounded-lg transition-colors"
              >
                {editingId ? 'Güncelle' : 'Kaydet'}
              </button>
              <button
                onClick={resetForm}
                className="bg-stone-700 hover:bg-stone-600 text-white px-6 py-2 rounded-lg transition-colors"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {/* Ürün Listesi */}
        {loading ? (
          <p className="text-stone-400">Yükleniyor...</p>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <div className="text-5xl mb-4">📋</div>
            <p>Henüz ürün eklenmemiş.</p>
          </div>
        ) : (
          <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Ürün</th>
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Kategori</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Ham Maliyet</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Satış Fiyatı</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Kar Marjı</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, i) => {
                  const margin = getMargin(product)
                  const marginNum = margin ? parseFloat(margin) : 0
                  return (
                    <tr key={product.id} className={`border-b border-stone-800 hover:bg-stone-800 transition-colors`}>
                      <td className="px-4 py-3 font-medium">{product.name}</td>
                      <td className="px-4 py-3 text-stone-400 text-sm">{product.category}</td>
                      <td className="px-4 py-3 text-right text-amber-400">₺{product.calculated_cost.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">₺{product.selling_price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        {margin ? (
                          <span className={`font-bold ${marginNum > 50 ? 'text-green-400' : marginNum > 30 ? 'text-yellow-400' : 'text-red-400'}`}>
                            %{margin}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleEdit(product)} className="text-blue-400 hover:text-blue-300 text-sm mr-3">Düzenle</button>
                        <button onClick={() => handleDelete(product.id)} className="text-red-400 hover:text-red-300 text-sm">Sil</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}