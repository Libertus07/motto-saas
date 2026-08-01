import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/lib/supabase-server'
import { devError } from '@/lib/debug'
import { z } from 'zod'

const MenuEngineerRecommendationSchema = z.object({
  product_name: z.string(),
  issue: z.string().optional().nullable(),
  action: z.string().optional().nullable(),
  impact: z.string().optional().nullable(),
})

const MenuEngineerSchema = z.object({
  summary: z.string().optional().nullable(),
  recommendations: z.array(MenuEngineerRecommendationSchema).default([]),
})

const MenuEngineerRequestSchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string(),
        category: z.string(),
        calculated_cost: z.number(),
        sale_price: z.number(),
        estimated_monthly_sales: z.number().optional(),
      }),
    )
    .min(1),
})

export async function POST(req: Request) {
  try {
    const { user, supabase } = await requireUser()
    if (!user) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 })
    }

    // AI Kota Kontrolü (SEC-104)
    const { data: allowed } = await supabase.rpc('check_ai_quota')
    if (!allowed) {
      return NextResponse.json({ error: 'Günlük limit doldu, yarın tekrar deneyin.' }, { status: 429 })
    }

    const requestResult = MenuEngineerRequestSchema.safeParse(await req.json())

    if (!requestResult.success) {
      return NextResponse.json({ error: 'Ürün verisi bulunamadı.' }, { status: 400 })
    }
    const { products } = requestResult.data

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı.' }, { status: 400 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    })

    const productData = products.map((p) => ({
      isim: p.name,
      kategori: p.category,
      maliyet: p.calculated_cost,
      satis_fiyati: p.sale_price,
      kar_marji: p.sale_price > 0 ? ((p.sale_price - p.calculated_cost) / p.sale_price) * 100 : 0,
      aylik_satis_adeti: p.estimated_monthly_sales,
    }))

    const prompt = `Sen profesyonel bir restoran/kafe menü mühendisi ve finansal danışmanısın.
Aşağıda kullanıcının menüsündeki ürünler, maliyetleri, satış fiyatları, kar marjları ve aylık satış adetleri verilmiştir.

Veriler:
${JSON.stringify(productData, null, 2)}

Lütfen bu verileri analiz et ve işletmenin karlılığını artıracak stratejik kararlar öner.
Yanıtını SADECE aşağıdaki JSON formatında ver, ekstra markdown (\`\`\`json vb) ekleme:
{
  "summary": "Genel menü sağlığı hakkında 1-2 cümlelik kısa özet",
  "recommendations": [
    {
      "product_name": "Ürün Adı",
      "issue": "Sorun nedir? (örn: Kar marjı çok düşük, %20'nin altında)",
      "action": "Ne yapılmalı? (örn: Fiyat 150₺ yapılmalı veya porsiyon küçültülmeli)",
      "impact": "Tahmini etkisi (örn: Aylık 3000₺ ek kar)"
    }
  ]
}`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    const jsonStr = responseText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim()
    const parsed = JSON.parse(jsonStr)
    const validated = MenuEngineerSchema.parse(parsed)

    return NextResponse.json(validated)
  } catch (error: unknown) {
    devError('AI Menu Engineer error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Yapay zeka analiz yaparken veri formatı hatalı oldu (' + error.issues[0]?.message + ')' },
        { status: 500 },
      )
    }
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: 'Yapay zeka analiz yaparken bir hata oluştu: ' + message }, { status: 500 })
  }
}
