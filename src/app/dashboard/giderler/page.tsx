'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { useNotification } from '@/components/NotificationProvider'
import { formatCurrency } from "@/lib/format";

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

  // Son 30 gün hesaplamaları (Gerçek Nakit Çıkışı)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentExpenses = expenses.filter(exp => {
    const d = new Date(exp.expense_date)
    return d >= thirtyDaysAgo
  })

  // Son 30 gün içinde cepten çıkan toplam fiziksel nakit
  const monthlyTotal = recentExpenses.reduce((total, exp) => {
    if (exp.category === 'indirim-ikram' || exp.category === 'iade') return total;
    return total + exp.amount; // period ne olursa olsun, kasadan çıktıysa topla
  }, 0)

  // Kategori bazlı toplam (Son 30 gün)
  const byCategory = categories.map(cat => ({
    label: cat.label,
    value: cat.value,
    total: recentExpenses
      .filter(e => e.category === cat.value)
      .reduce((sum, e) => sum + e.amount, 0)
  })).filter(c => c.total > 0)

  // İkon haritası (Görsel algıyı hızlandırmak için)
  const categoryIcons: Record<string, string> = {
    kira: '🏢', personel: '👥', elektrik: '⚡', su: '💧', dogalgaz: '🔥',
    internet: '🌐', muhasebe: '📊', sigorta: '🛡️', pazarlama: '📢', diger: '📦'
  }

  const getCategoryIcon = (cat: string) => categoryIcons[cat] || '🏷️'
  
  // Dağılım çubuğu için renkler
  const chartColors = ['bg-amber-400', 'bg-emerald-400', 'bg-blue-400', 'bg-rose-400', 'bg-purple-400', 'bg-cyan-400']

  return (
    <div className="flex flex-col-reverse xl:flex-row min-h-screen bg-stone-950 text-white">
      
      {/* Ana İçerik */}
      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-black text-amber-400 tracking-tight flex items-center gap-3">
              <span className="text-4xl">💸</span> Giderler & Maliyet Kokpiti
            </h1>
            <p className="text-stone-400 mt-1">İşletmenizin finansal çıkışlarını ve masraf dağılımını analiz edin.</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="bg-amber-500 hover:bg-amber-400 text-stone-950 font-black px-6 py-3 rounded-2xl shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:-translate-y-1 transition-all flex items-center gap-2"
          >
            <span className="text-xl">⚡</span>
            Yeni Gider Ekle
          </button>
        </header>

        {/* 1. Bento Grid: Özet Kartları */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 text-xl border border-amber-500/20">
                📉
              </div>
              <div>
                <p className="text-stone-400 text-sm font-medium">Son 30 Gün (Nakit Çıkışı)</p>
                <h3 className="text-3xl font-black text-white tracking-tight">{formatCurrency(monthlyTotal)}</h3>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 text-xl border border-emerald-500/20">
                📅
              </div>
              <div>
                <p className="text-stone-400 text-sm font-medium">Günlük Ortalama Gider</p>
                <h3 className="text-3xl font-black text-white tracking-tight">{formatCurrency((monthlyTotal / 30))}</h3>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-bl-full -z-10 group-hover:scale-110 transition-transform" />
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 text-xl border border-blue-500/20">
                ⏱️
              </div>
              <div>
                <p className="text-stone-400 text-sm font-medium">Saatlik Gider (12 Saat)</p>
                <h3 className="text-3xl font-black text-white tracking-tight">{formatCurrency((monthlyTotal / 30 / 12))}</h3>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Modern Dağılım Çubuğu */}
        {byCategory.length > 0 && (
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-8 mb-8 shadow-2xl">
            <h3 className="text-lg font-bold text-stone-300 mb-6 flex items-center gap-2">
              📊 Son 30 Gün Kategori Dağılımı
            </h3>
            
            {/* Horizontal Bar */}
            <div className="w-full h-6 flex rounded-full overflow-hidden mb-6 shadow-inner bg-stone-950">
              {byCategory.sort((a, b) => b.total - a.total).map((cat, i) => {
                const percentage = (cat.total / monthlyTotal) * 100;
                return (
                  <div 
                    key={cat.value} 
                    className={`h-full ${chartColors[i % chartColors.length]} hover:brightness-110 transition-all cursor-pointer border-r border-stone-900 last:border-r-0`}
                    style={{ width: `${percentage}%` }}
                    title={`${cat.label}: ${formatCurrency(cat.total)} (%${percentage.toFixed(1)})`}
                  />
                )
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4">
              {byCategory.sort((a, b) => b.total - a.total).map((cat, i) => (
                <div key={cat.value} className="flex items-center gap-2 bg-stone-950/50 px-3 py-1.5 rounded-xl border border-stone-800/50">
                  <div className={`w-3 h-3 rounded-full ${chartColors[i % chartColors.length]}`} />
                  <span className="text-stone-300 text-sm font-medium">{getCategoryIcon(cat.value)} {cat.label}</span>
                  <span className="text-stone-500 text-sm border-l border-stone-800 pl-2">%{((cat.total / monthlyTotal) * 100).toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Giderler Tablosu */}
        <div className="bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-6 border-b border-stone-800 flex justify-between items-center">
            <h3 className="text-lg font-bold text-stone-300 flex items-center gap-2">📋 İşlem Geçmişi</h3>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-stone-500 animate-pulse">Yükleniyor...</div>
          ) : expenses.length === 0 ? (
            <div className="p-16 text-center text-stone-500">
              <div className="text-6xl mb-4 opacity-50">📭</div>
              <p>Henüz bir gider kaydedilmemiş.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-950/50 text-stone-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-medium border-b border-stone-800">Tarih</th>
                    <th className="p-4 font-medium border-b border-stone-800">Gider Adı</th>
                    <th className="p-4 font-medium border-b border-stone-800">Kategori</th>
                    <th className="p-4 font-medium border-b border-stone-800 text-center">Periyot</th>
                    <th className="p-4 font-medium border-b border-stone-800 text-right">Tutar</th>
                    <th className="p-4 font-medium border-b border-stone-800 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50">
                  {expenses.map(exp => {
                    const isDiscount = exp.category === 'indirim-ikram' || exp.category === 'iade'
                    return (
                      <tr key={exp.id} className="hover:bg-stone-800/20 transition-colors group">
                        <td className="p-4 text-sm text-stone-400 whitespace-nowrap">
                          {new Date(exp.expense_date).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </td>
                        <td className="p-4 font-medium text-stone-200">
                          {exp.name}
                          {isDiscount && <span className="ml-2 text-[10px] bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full">Muhasebesel</span>}
                        </td>
                        <td className="p-4">
                          <div className="inline-flex items-center gap-2 bg-stone-950 px-3 py-1 rounded-full border border-stone-800 text-sm">
                            <span>{getCategoryIcon(exp.category)}</span>
                            <span className="text-stone-300 capitalize">{categories.find(c => c.value === exp.category)?.label || exp.category}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className={`text-xs px-2 py-1 rounded-md font-bold ${
                            exp.period === 'monthly' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
                            exp.period === 'yearly' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                            'bg-stone-800 text-stone-400 border border-stone-700'
                          }`}>
                            {exp.period === 'monthly' ? 'Aylık' : exp.period === 'yearly' ? 'Yıllık' : 'Tek Seferlik'}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <span className={`font-bold ${isDiscount ? 'text-stone-500 line-through' : 'text-rose-400'}`}>
                            {formatCurrency(exp.amount)}
                          </span>
                          {exp.period === 'yearly' && (
                            <div className="text-[10px] text-stone-500 mt-1">Aylık Yük: {formatCurrency(exp.amount / 12)}</div>
                          )}
                        </td>
                        <td className="p-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(exp)} className="text-blue-400 hover:text-blue-300 text-sm mr-3 font-medium">Düzenle</button>
                          <button onClick={() => handleDelete(exp.id)} className="text-rose-400 hover:text-rose-300 text-sm font-medium">Sil</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Sağ Kısım: Modal "Hızlı Gider Ekle" Paneli */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/80 backdrop-blur-sm transition-opacity">
          <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-stone-800 rounded-3xl p-6 md:p-8 w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
            
            {/* Kapatma Butonu */}
            <button 
              onClick={resetForm}
              className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center rounded-full bg-stone-800 hover:bg-rose-500/20 hover:text-rose-400 text-stone-400 transition-colors"
            >
              ✕
            </button>

            <div className="flex items-center gap-3 mb-8 pb-6 border-b border-stone-800">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 text-xl border border-amber-500/20">
                {editingId ? '✏️' : '⚡'}
              </div>
              <h2 className="text-xl font-bold text-white">
                {editingId ? 'Gideri Düzenle' : 'Hızlı Gider Ekle'}
              </h2>
            </div>

            <div className="flex flex-col gap-5 flex-1">
              <div>
                <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-2 block">Ne Gideri? (Adı)</label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors placeholder-stone-700"
                  placeholder="Örn: Kasap Alışverişi"
                />
              </div>

              <div>
                <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-2 block">Kategori</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors mb-2 cursor-pointer"
                >
                  {categories.map(c => <option key={c.value} value={c.value}>{getCategoryIcon(c.value)} {c.label}</option>)}
                  <option value="custom" className="text-amber-500 font-bold">+ Yeni Kategori Ekle</option>
                </select>
                {form.category === 'custom' && (
                  <input
                    value={customCategory}
                    onChange={e => setCustomCategory(e.target.value)}
                    className="w-full bg-stone-900 border border-amber-500/50 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors mt-2"
                    placeholder="Kategori Adı..."
                    autoFocus
                  />
                )}
              </div>

              <div>
                <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-2 block">Tutar (TL)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500 font-bold">₺</span>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl py-3 pl-10 pr-4 text-white font-bold text-lg focus:outline-none focus:border-amber-500 transition-colors placeholder-stone-700"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-2 block">Periyot</label>
                  <select
                    value={form.period}
                    onChange={e => setForm({ ...form, period: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors cursor-pointer"
                  >
                    <option value="daily">Tek Seferlik / Günlük</option>
                    <option value="monthly">Aylık Düzenli</option>
                    <option value="yearly">Yıllık Düzenli</option>
                  </select>
                </div>
                <div>
                  <label className="text-stone-400 text-xs font-bold uppercase tracking-wider mb-2 block">Tarih</label>
                  <input
                    type="date"
                    value={form.expense_date}
                    onChange={e => setForm({ ...form, expense_date: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white font-medium focus:outline-none focus:border-amber-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-stone-800 flex gap-4">
              <button
                onClick={resetForm}
                className="flex-1 bg-stone-800 hover:bg-stone-700 text-white font-bold py-4 rounded-xl transition-colors"
              >
                İptal Et
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-lg py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)]"
              >
                {editingId ? 'GÜNCELLE' : 'KAYDET'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
