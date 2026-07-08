import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireUser } from '@/lib/supabase-server';

function isSafeImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return false;
        const host = parsed.hostname;
        if (
            host === 'localhost' ||
            host.startsWith('127.') ||
            host.startsWith('10.') ||
            host.startsWith('192.168.') ||
            host.startsWith('169.254.') ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
        ) return false;
        return true;
    } catch {
        return false;
    }
}

export async function POST(req: Request) {
    try {
        const { user } = await requireUser();
        if (!user) {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
        }

        const { image, fileText } = await req.json();

        if (!image && !fileText) {
            return NextResponse.json({ error: 'Dosya verisi eksik.' }, { status: 400 });
        }

        let mimeType = '';
        let base64Data = '';

        if (image) {
            if (image.startsWith('http://') || image.startsWith('https://')) {
                if (!isSafeImageUrl(image)) {
                    return NextResponse.json({ error: 'İzin verilmeyen veya güvensiz URL.' }, { status: 400 });
                }
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
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Lütfen yüklenen belgeyi (Kuyumcu fişi, Döviz dekontu, Tapu Senedi, Araç Alım Satım evrağı vb.) incele ve bunun bir finansal yatırım işlemi olduğunu varsayarak verileri analiz et.

Bu bir YATIRIM işlemidir. Senden beklediğim şey, belgenin içinden aşağıdaki JSON yapısına uygun bilgileri çıkarman:
- asset_type: 'gold' (Altın/Ziynet işlemleri), 'usd' (Dolar alımı), 'eur' (Euro alımı), 'real_estate' (Tapu, Ev, Arsa veya Araç gibi büyük mülkler) değerlerinden EN UYGUN olanını seç. Eğer hiçbiri uymuyorsa 'gold' olarak bırak.
- quantity: Sayısal olarak alınan miktar. (Örn: 2000 Dolar alındıysa 2000. 15 Gram altınsa 15. Tapu/Ev ise 1)
- price_per_unit: 1 birimin alış fiyatı veya Tapu ise toplam maliyeti. (Örn: Dolar kuru 33.50 ise 33.50 yaz. Evin toplam bedeli 2.000.000 TL ise buraya 2000000 yaz.)
- purchase_date: Belgenin üzerindeki işlem tarihi (YYYY-MM-DD formatında). Yoksa null dön.
- notes: Bu işleme dair önemli notlar. Eğer tapu ise Ada, Parsel, İl, İlçe vb. bilgileri yaz. Değilse "Kuyumcu fişi", "Döviz dekontu" vb. gibi kısa ve güzel bir özet çıkar.

Yanıtı SADECE aşağıdaki formatta saf JSON olarak dön (markdown kullanma):
{
    "asset_type": "gold",
    "quantity": sayı,
    "price_per_unit": sayı,
    "purchase_date": "YYYY-MM-DD" veya null,
    "notes": "Belge hakkında önemli özet bilgi"
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
            contentParts.push(`\n\n--- DOSYA İÇERİĞİ ---\n${fileText}`);
        }

        const result = await model.generateContent(contentParts);
        const responseText = result.response.text();
        
        const jsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        return NextResponse.json(parsed);

    } catch (error: unknown) {
        console.error('Investment receipt parsing error:', error);
        const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
        return NextResponse.json({ error: 'Yapay zeka analiz yaparken bir hata oluştu: ' + message }, { status: 500 });
    }
}
