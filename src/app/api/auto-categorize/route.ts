import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireUser } from '@/lib/supabase-server'
import { devError } from '@/lib/debug'

import { z } from 'zod'

const AutoCategorizeSchema = z.object({
  materials: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string().optional().nullable(),
      }),
    )
    .min(1, 'Hammadde listesi boş.')
    .max(200, 'Tek seferde en fazla 200 hammadde kategorize edilebilir.'),
  categories: z.array(z.string()).optional(),
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

    const body = await req.json()
    const parsed = AutoCategorizeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Geçersiz veri formatı.' }, { status: 400 })
    }

    const { materials, categories } = parsed.data

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı.' }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    })

    const categoryList = (categories || []).join(', ')
    const materialLines = materials
      .map((m) => `- id: ${m.id} | ad: ${m.name} | mevcut_kategori: ${m.category || 'Yok'}`)
      .join('\n')

    const prompt = `Sen bir restoran/kafe tedarik zinciri uzmanısın.
Sana verilen hammadde listesindeki her ürün için, yine sana verilen KATEGORİ listesinden en uygun olanı seç.

MEVCUT KATEGORİLER: ${categoryList}

HAMMADDELER:
${materialLines}

KURALLAR:
1. Her hammadde için SADECE yukarıdaki kategori listesinden birini seç. Listede olmayan bir kategori uydurmayacaksın.
2. Hammadde adına ve doğasına bakarak en mantıklı kategoriyi seç. Örnek:
   - "Espresso", "Filtre Kahve" → Kahve & Çay
   - "Tam Yağlı Süt", "Krema" → Süt Ürünleri
   - "Karton Bardak", "Kapak", "Peçete" → Ambalaj ve Sarf
   - "Elma", "Limon", "Nane" → Manav
   - "Granül Şeker", "Un", "Tuz" → Kuru Gıda
   - "Vanilya Şurubu", "Karamel Sos" → Şuruplar ve Soslar
   - "Deterjan", "Eldiven" → Temizlik
3. Eğer hiçbir kategoriye uymuyorsa "Diğer" seç.
4. Sadece JSON dön, başka açıklama ekleme.

Yanıtı SADECE şu JSON formatında ver:
[
  { "id": "hammadde-uuid", "suggested_category": "Kategori Adı" },
  ...
]`

    const result = await model.generateContent(prompt)
    const text = result.response
      .text()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()

    const suggestions = JSON.parse(text)
    return NextResponse.json({ suggestions })
  } catch (error: unknown) {
    devError('Auto-categorize error:', error)
    const message = error instanceof Error ? error.message : 'Bilinmeyen hata'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
