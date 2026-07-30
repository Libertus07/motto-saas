import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts'
import { Calculation, ProductSales, PricingSettings } from '../../types'
import { formatCurrency } from '@/lib/format'

type ReportsTabProps = {
  calculations: Calculation[]
  productSales: ProductSales
  totalDailyProfit: number
  dailyExpenses: number
  settings: PricingSettings
}

export function ReportsTab({ calculations, productSales, totalDailyProfit, dailyExpenses, settings }: ReportsTabProps) {
  // Chart data
  const chartData = calculations
    .map(c => ({
      name: c.product.name,
      sales: productSales[c.product.id]?.dailySales || 0,
      dailyProfit: Number(c.dailyProfit.toFixed(0)),
      currentMargin: Number(c.currentMargin.toFixed(1))
    }))
    .sort((a, b) => b.dailyProfit - a.dailyProfit)

  const totalRawCost = calculations.reduce((t, c) => {
    const sales = productSales[c.product.id]?.dailySales || 0
    return t + c.rawCost * sales
  }, 0)

  const pieData = [
    { name: 'Hammadde (COGS)', value: Number(totalRawCost.toFixed(0)), color: '#f59e0b' },
    { name: 'Genel Giderler', value: Number(dailyExpenses.toFixed(0)), color: '#ef4444' },
    { name: 'Net Kâr', value: totalDailyProfit > 0 ? Number(totalDailyProfit.toFixed(0)) : 0, color: '#10b981' }
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      {/* Nakit Katkı Grafiği */}
      <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
        <div>
          <h3 className="font-extrabold text-amber-400 text-sm sm:text-base flex items-center gap-2">
            <span>💰</span>
            <span>Satış Karması ve Nakit Katkısı (Contribution Margin)</span>
          </h3>
          <p className="text-stone-400 text-xs mt-0.5">
            Hangi ürünlerin kâr marjı yüksek, hangileri işletme kasasına en çok sıcak parayı bırakıyor?
          </p>
        </div>

        <div className="h-80 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid stroke="#292524" strokeDasharray="3 3" />
              <XAxis dataKey="name" stroke="#a8a29e" angle={-45} textAnchor="end" height={60} />
              <YAxis yAxisId="left" stroke="#10b981" orientation="left" />
              <YAxis yAxisId="right" stroke="#3b82f6" orientation="right" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1c1917', borderColor: '#292524', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="dailyProfit"
                name="Günlük Net Kâr (TL)"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="currentMargin"
                name="Kâr Marjı (%)"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ r: 4 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Maliyet Dağılımı (Pie Chart) */}
        <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
          <div>
            <h3 className="font-extrabold text-amber-400 text-sm sm:text-base flex items-center gap-2">
              <span>🍕</span>
              <span>Maliyet Dağılımı (Prime Cost vs Overhead)</span>
            </h3>
            <p className="text-stone-400 text-xs mt-0.5">
              Cironun ne kadarı hammaddeye, ne kadarı sabit giderlere, ne kadarı net kâra gidiyor?
            </p>
          </div>

          <div className="h-64 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1c1917', borderColor: '#292524', color: '#fff' }}
                  formatter={(value: number) => formatCurrency(Number(value) || 0)}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* BCG Matrisi (Quad Card View) */}
        <div className="bg-stone-900/80 border border-stone-800/80 backdrop-blur-md rounded-2xl p-5 shadow-xl space-y-4">
          <div>
            <h3 className="font-extrabold text-amber-400 text-sm sm:text-base flex items-center gap-2">
              <span>⭐</span>
              <span>Yıldızlar ve Köpekler (BCG Matrisi)</span>
            </h3>
            <p className="text-stone-400 text-xs mt-0.5">
              Sağ üst köşe: Çok satan, çok kâr ettiren (Yıldız). Sol alt: Az satan, az kâr ettiren (Köpek).
            </p>
          </div>

          {/* Legend Guide Cards */}
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl text-emerald-400 flex items-center gap-1.5 font-bold">
              <span>⭐</span>
              <span>Yıldızlar (Yüksek Marj + Yüksek Satış)</span>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl text-rose-400 flex items-center gap-1.5 font-bold">
              <span>🚨</span>
              <span>Risk Grubu (Düşük Marj + Düşük Satış)</span>
            </div>
          </div>

          <div className="h-64 w-full text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid stroke="#292524" strokeDasharray="3 3" />
                <XAxis type="number" dataKey="sales" name="Satış Adedi" stroke="#a8a29e" />
                <YAxis type="number" dataKey="currentMargin" name="Kâr Marjı (%)" stroke="#a8a29e" />
                <ZAxis type="number" range={[100, 100]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ backgroundColor: '#1c1917', borderColor: '#292524', color: '#fff' }}
                  formatter={(value: number, name: string) => [
                    name === 'Satış Adedi' ? `${value} adet` : `%${value}`,
                    name
                  ]}
                  labelFormatter={() => ''}
                />
                <Scatter name="Ürünler" data={chartData} fill="#f59e0b">
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.currentMargin > settings.targetMargin ? '#10b981' : '#ef4444'}
                    />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
