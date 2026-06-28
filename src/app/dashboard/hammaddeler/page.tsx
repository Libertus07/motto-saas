'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Ingredient = {
  id: string
  name: string
  unit: string
  unit_price: number
  stock_quantity: number
  critical_stock_level: number
}

export default function Hammaddeler() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    unit: 'gram',
    unit_price: '',
    stock_quantity: '',
    critical_stock_level: ''
  })
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => { fetchIngredients() }, [])

  const fetchIngredients = async () => {
    const { data } = await supabase
      .from('ingredients')
      .select('*')
      .order('name')
    setIngredients(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setForm({ name: '', unit: 'gram', unit_price: '', stock_quantity: '', critical_stock_level: '' })
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async () => {
    if (!form.name || !form.unit_price) return

    const payload = {
      name: form.name,
      unit: form.unit,
      unit_price: parseFloat(form.unit_price),
      stock_quantity: parseFloat(form.stock_quantity || '0'),
      critical_stock_level: parseFloat(form.critical_stock_level || '0')
    }

    if (editingId) {
      await supabase.from('ingredients').update(payload).eq('id', editingId)
    } else {
      await supabase.from('ingredients').insert(payload)
    }

    resetForm()
    fetchIngredients()
  }

  const handleEdit = (ing: Ingredient) => {
    setForm({
      name: ing.name,
      unit: ing.unit,
      unit_price: ing.unit_price.toString(),
      stock_quantity: ing.stock_quantity.toString(),
      critical_stock_level: ing.critical_stock_level.toString()
    })
    setEditingId(ing.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Bu hammaddeyi silmek istediğinize emin misiniz?')) return
    await supabase.from('ingredients').delete().eq('id', id)
    fetchIngredients()
  }

  const units = ['gram', 'kg', 'ml', 'litre', 'adet', 'paket']

  return (
    <div className="min-h-screen bg-stone-950 text-white">

      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-stone-400 hover:text-white">← Geri</button>
          <span className="text-stone-600">|</span>
          <span className="text-2xl">🧪</span>
          <h1 className="font-bold text-amber-400">Hammaddeler</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Yeni Hammadde
        </button>
      </header>

      <main className="p-6">

        {/* Form */}
        {showForm && (
          <div className="bg-stone-900 border border-amber-400 rounded-xl p-6 mb-6">
            <h2 className="font-bold text-lg mb-4">
              {editingId ? 'Hammadde Düzenle' : 'Yeni Hammadde Ekle'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Hammadde Adı *</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="örn: Espresso Çekirdeği"
                />
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Birim *</label>
                <select
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Birim Fiyat (₺) *</label>
                <input
                  type="number"
                  value={form.unit_price}
                  onChange={e => setForm({ ...form, unit_price: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Mevcut Stok</label>
                <input
                  type="number"
                  value={form.stock_quantity}
                  onChange={e => setForm({ ...form, stock_quantity: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Kritik Stok Seviyesi</label>
                <input
                  type="number"
                  value={form.critical_stock_level}
                  onChange={e => setForm({ ...form, critical_stock_level: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
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

        {/* Tablo */}
        {loading ? (
          <p className="text-stone-400">Yükleniyor...</p>
        ) : ingredients.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <div className="text-5xl mb-4">🧪</div>
            <p>Henüz hammadde eklenmemiş.</p>
            <p className="text-sm mt-1">Yukarıdaki butonu kullanarak başlayın.</p>
          </div>
        ) : (
          <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left px-4 py-3 text-stone-400 text-sm font-medium">Hammadde</th>
                  <th className="text-left px-4 py-3 text-stone-400 text-sm font-medium">Birim</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm font-medium">Birim Fiyat</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm font-medium">Stok</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm font-medium">Kritik Seviye</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, i) => (
                  <tr key={ing.id} className={`border-b border-stone-800 hover:bg-stone-800 transition-colors ${i % 2 === 0 ? '' : 'bg-stone-900'}`}>
                    <td className="px-4 py-3 font-medium">{ing.name}</td>
                    <td className="px-4 py-3 text-stone-400">{ing.unit}</td>
                    <td className="px-4 py-3 text-right text-amber-400">₺{ing.unit_price.toFixed(2)}</td>
                    <td className={`px-4 py-3 text-right ${ing.stock_quantity <= ing.critical_stock_level ? 'text-red-400' : 'text-green-400'}`}>
                      {ing.stock_quantity} {ing.unit}
                    </td>
                    <td className="px-4 py-3 text-right text-stone-400">{ing.critical_stock_level} {ing.unit}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleEdit(ing)} className="text-blue-400 hover:text-blue-300 text-sm mr-3">Düzenle</button>
                      <button onClick={() => handleDelete(ing.id)} className="text-red-400 hover:text-red-300 text-sm">Sil</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
