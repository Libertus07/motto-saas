import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
    try {
        const { products } = await req.json();

        if (!products || products.length === 0) {
            return NextResponse.json({ error: 'Ürün verisi bulunamadı.' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı.' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        const productData = products.map((p: any) => ({
            isim: p.name,
            kategori: p.category,
            maliyet: p.calculated_cost,
            satis_fiyati: p.sale_price,
            kar_marji: p.sale_price > 0 ? ((p.sale_price - p.calculated_cost) / p.sale_price) * 100 : 0,
            aylik_satis_adeti: p.estimated_monthly_sales
        }));

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
}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        const jsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        return NextResponse.json(parsed);

    } catch (error: any) {
        console.error('AI Menu Engineer error:', error);
        return NextResponse.json({ error: 'Yapay zeka analiz yaparken bir hata oluştu: ' + error.message }, { status: 500 });
    }
}
