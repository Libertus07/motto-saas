'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'

type Expense = {
  id: string
  name: string
  category: string
  amount: number
  period: string
  expense_date: string
}

export default function Giderler() {
  const { showConfirm, showAlert } = useNotification()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [customCategory, setCustomCategory] = useState('')
  const [form, setForm] = useState({
    name: '',
    category: 'kira',
    amount: '',
    period: 'monthly',
    expense_date: new Date().toISOString().split('T')[0]
  })
  const supabase = createClient()
  const router = useRouter()

  const defaultCategories = [
    { value: 'kira', label: 'Kira' },
    { value: 'personel', label: 'Personel' },
    { value: 'elektrik', label: 'Elektrik' },
    { value: 'su', label: 'Su' },
    { value: 'dogalgaz', label: 'Doğalgaz' },
    { value: 'internet', label: 'İnternet' },
    { value: 'muhasebe', label: 'Muhasebe' },
    { value: 'sigorta', label: 'Sigorta' },
    { value: 'pazarlama', label: 'Pazarlama' },
    { value: 'diger', label: 'Diğer' }
  ]

  const uniqueCategories = Array.from(new Set(expenses.map(e => e.category)))
  uniqueCategories.forEach(cat => {
    if (!defaultCategories.find(c => c.value === cat)) {
      const label = cat.charAt(0).toUpperCase() + cat.slice(1)
      defaultCategories.push({ value: cat, label })
    }
  })

  const categories = defaultCategories

  useEffect(() => { fetchExpenses() }, [])

  const fetchExpenses = async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
    setExpenses(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setForm({
      name: '',
      category: 'kira',
      amount: '',
      period: 'monthly',
      expense_date: new Date().toISOString().split('T')[0]
    })
    setCustomCategory('')
    setEditingId(null)
    setShowForm(false)
  }

  const handleSubmit = async () => {
    if (!form.name || !form.amount) return

    const finalCategory = form.category === 'custom' ? customCategory.trim().toLowerCase().replace(/\s+/g, '-') : form.category
    if (form.category === 'custom' && !finalCategory) {
        await showAlert('Lütfen geçerli bir kategori adı girin.', 'warning')
        return
    }

    const payload = {
      name: form.name,
      category: finalCategory,
      amount: parseFloat(form.amount),
      period: form.period,
      expense_date: form.expense_date
    }

    let details = ''

    if (editingId) {
      const oldExp = expenses.find(e => e.id === editingId)
      const changes = []
      if (oldExp?.amount !== payload.amount) changes.push(`Tutar: ${oldExp?.amount} -> ${payload.amount} ₺`)
      if (oldExp?.category !== payload.category) changes.push(`Kategori: ${oldExp?.category} -> ${payload.category}`)
      if (oldExp?.period !== payload.period) changes.push(`Periyot: ${oldExp?.period} -> ${payload.period}`)
      if (oldExp?.expense_date !== payload.expense_date) changes.push(`Tarih: ${oldExp?.expense_date} -> ${payload.expense_date}`)
      details = changes.length > 0 ? changes.join(', ') : 'Gider ismi güncellendi'

      await supabase.from('expenses').update(payload).eq('id', editingId)
    } else {
      details = `Tutar: ${payload.amount} ₺, Kategori: ${payload.category}, Periyot: ${payload.period}, Tarih: ${payload.expense_date}`
      await supabase.from('expenses').insert(payload)
    }

    resetForm()
    fetchExpenses()
    logActivity('Giderler', editingId ? 'GUNCELLEME' : 'EKLEME', `${form.name} isimli ${form.amount} TL tutarında gider ${editingId ? 'güncellendi' : 'eklendi'}.`, { detay: details })
  }

  const handleEdit = (expense: Expense) => {
    setForm({
      name: expense.name,
      category: expense.category,
      amount: expense.amount.toString(),
      period: expense.period,
      expense_date: expense.expense_date
    })
    setEditingId(expense.id)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('Bu gideri silmek istediğinize emin misiniz?', 'Gideri Sil 🗑️')
    if (!confirmed) return
    await supabase.from('expenses').delete().eq('id', id)
    fetchExpenses()
    logActivity('Giderler', 'SILME', `Bir gider kaydı sistemden silindi.`, { expenseId: id })
  }

  // Aylık toplam hesapla
  const monthlyTotal = expenses.reduce((total, exp) => {
    if (exp.period === 'monthly') return total + exp.amount
    if (exp.period === 'yearly') return total + exp.amount / 12
    return total
  }, 0)

  // Kategori bazlı toplam
  const byCategory = categories.map(cat => ({
    label: cat.label,
    value: cat.value,
    total: expenses
      .filter(e => e.category === cat.value)
      .reduce((sum, e) => sum + (e.period === 'yearly' ? e.amount / 12 : e.amount), 0)
  })).filter(c => c.total > 0)

  return (
    <div className="min-h-full bg-stone-950 text-white">

      {/* Header */}
      <header className="bg-stone-900 border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <h1 className="font-bold text-amber-400">Giderler</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Yeni Gider
        </button>
      </header>

      <main className="p-6">

        {/* Özet Kartlar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <p className="text-stone-400 text-sm mb-1">Aylık Toplam Gider</p>
            <p className="text-3xl font-bold text-amber-400">₺{monthlyTotal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <p className="text-stone-400 text-sm mb-1">Günlük Gider</p>
            <p className="text-3xl font-bold text-white">₺{(monthlyTotal / 30).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <p className="text-stone-400 text-sm mb-1">Saatlik Gider (12 saat)</p>
            <p className="text-3xl font-bold text-white">₺{(monthlyTotal / 30 / 12).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        {/* Kategori Dağılımı */}
        {byCategory.length > 0 && (
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 mb-6">
            <h3 className="font-bold mb-4 text-stone-300">Kategori Dağılımı (Aylık)</h3>
            <div className="space-y-2">
              {byCategory.sort((a, b) => b.total - a.total).map(cat => (
                <div key={cat.value} className="flex items-center gap-3">
                  <span className="text-stone-400 text-sm w-24">{cat.label}</span>
                  <div className="flex-1 bg-stone-800 rounded-full h-2">
                    <div
                      className="bg-amber-400 h-2 rounded-full"
                      style={{ width: `${(cat.total / monthlyTotal) * 100}%` }}
                    />
                  </div>
                  <span className="text-amber-400 text-sm w-24 text-right">₺{cat.total.toLocaleString('tr-TR', { minimumFractionDigits: 0 })}</span>
                  <span className="text-stone-500 text-xs w-10 text-right">%{((cat.total / monthlyTotal) * 100).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="bg-stone-900 border border-amber-400 rounded-xl p-6 mb-6">
            <h2 className="font-bold text-lg mb-4">
              {editingId ? 'Gider Düzenle' : 'Yeni Gider Ekle'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Gider Adı *</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="örn: Kira Ödemesi"
                />
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Kategori</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400 mb-2"
                >
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  <option value="custom" className="text-amber-500 font-bold">+ Yeni Kategori Ekle</option>
                </select>
                {form.category === 'custom' && (
                  <input
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    className="w-full bg-stone-800 border border-amber-500 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                    placeholder="Yeni kategori adı (örn: Nakliye)"
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Tutar (₺) *</label>
                <input
                  type="number"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Periyot</label>
                <select
                  value={form.period}
                  onChange={e => setForm({ ...form, period: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                >
                  <option value="monthly">Aylık</option>
                  <option value="yearly">Yıllık</option>
                </select>
              </div>
              <div>
                <label className="text-stone-400 text-sm mb-1 block">Tarih</label>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={e => setForm({ ...form, expense_date: e.target.value })}
                  className="w-full bg-stone-800 border border-stone-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-400"
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

        {/* Gider Listesi */}
        {loading ? (
          <p className="text-stone-400">Yükleniyor...</p>
        ) : expenses.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <div className="text-5xl mb-4">💰</div>
            <p>Henüz gider eklenmemiş.</p>
          </div>
        ) : (
          <div className="bg-stone-900 rounded-xl border border-stone-800 overflow-hidden">
            <div className="overflow-x-auto w-full">
<table className="w-full">
              <thead>
                <tr className="border-b border-stone-800">
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Gider</th>
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Kategori</th>
                  <th className="text-left px-4 py-3 text-stone-400 text-sm">Periyot</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Tutar</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">Aylık Karşılık</th>
                  <th className="text-right px-4 py-3 text-stone-400 text-sm">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} className="border-b border-stone-800 hover:bg-stone-800 transition-colors">
                    <td className="px-4 py-3 font-medium">{exp.name}</td>
                    <td className="px-4 py-3 text-stone-400 text-sm">
                      {categories.find(c => c.value === exp.category)?.label || exp.category}
                    </td>
                    <td className="px-4 py-3 text-stone-400 text-sm">
                      {exp.period === 'monthly' ? 'Aylık' : 'Yıllık'}
                    </td>
                    <td className="px-4 py-3 text-right">₺{exp.amount.toLocaleString('tr-TR')}</td>
                    <td className="px-4 py-3 text-right text-amber-400">
                      ₺{(exp.period === 'yearly' ? exp.amount / 12 : exp.amount).toLocaleString('tr-TR', { minimumFractionDigits: 0 })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleEdit(exp)} className="text-blue-400 hover:text-blue-300 text-sm mr-3">Düzenle</button>
                      <button onClick={() => handleDelete(exp.id)} className="text-red-400 hover:text-red-300 text-sm">Sil</button>
                    </td>
                  </tr>
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
