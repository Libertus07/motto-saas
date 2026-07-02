import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
    try {
        const { image, fileText, fileType, existingProducts } = await req.json();

        if (!image && !fileText) {
            return NextResponse.json({ error: 'Dosya verisi eksik.' }, { status: 400 });
        }

        let mimeType = '';
        let base64Data = '';

        if (image) {
            if (image.startsWith('http://') || image.startsWith('https://')) {
                const fetchRes = await fetch(image);
                if (!fetchRes.ok) {
                    return NextResponse.json({ error: 'URL den dosya indirilemedi.' }, { status: 400 });
                }
                mimeType = fetchRes.headers.get('content-type') || 'image/jpeg';
                const arrayBuffer = await fetchRes.arrayBuffer();
                base64Data = Buffer.from(arrayBuffer).toString('base64');
            } else {
                const match = image.match(/^data:([a-zA-Z0-9-]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
                if (!match) {
                    return NextResponse.json({ error: 'Geçersiz dosya formatı.' }, { status: 400 });
                }
                mimeType = match[1];
                base64Data = match[2];
            }
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı.' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        const prompt = `Lütfen bu POS Gün Sonu (Z Raporu), satış faturası, XML veya JSON dosyasını analiz et.
Satılan ürün kalemlerini, satış adetlerini ve satış tutarlarını çıkar.
Ayrıca, eğer fiş veya raporda kasadan yapılan günlük masraflar/giderler (örneğin Kurye yemeği, Temizlik, Manav, Bahşiş vb.) varsa bunları da ayıkla.
Aşağıdaki mevcut sistem ürünlerimle eşleşenleri "BİREBİR AYNI İSİMLE", eşleşmeyenleri ise fişteki ismiyle çıkar:
Mevcut Ürünler: ${existingProducts.join(', ')}

Yanıtı SADECE aşağıdaki JSON formatında ver, ekstra hiçbir markdown (\`\`\`json vb) veya düz metin ekleme:
{
  "date": "YYYY-MM-DD",
  "total_revenue": genel_toplam_satis_sayi_olarak,
  "items": [
    {
      "product_name": "ürün adı",
      "quantity": satilan_adet_sayi_olarak,
      "total_price": bu_kalemden_elde_edilen_toplam_gelir_sayi_olarak
    }
  ],
  "expenses": [
    {
      "expense_name": "gider açıklaması/adı (örn: Kurye Bahşiş)",
      "amount": gider_tutarı_sayı_olarak
    }
  ]
}`;

        let contentParts: any[] = [prompt];

        if (image) {
            contentParts.push({
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            });
        } else if (fileText) {
            contentParts.push(`\n\n--- DOSYA İÇERİĞİ (${fileType}) ---\n${fileText}`);
        }

        const result = await model.generateContent(contentParts);
        const responseText = result.response.text();
        
        const jsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        return NextResponse.json(parsed);

    } catch (error: any) {
        console.error('Z-Report parsing error:', error);
        return NextResponse.json({ error: 'Yapay zeka Z Raporunu okurken bir hata oluştu: ' + error.message }, { status: 500 });
    }
}
