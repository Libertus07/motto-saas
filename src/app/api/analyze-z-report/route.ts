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
        const { image, fileText, fileType, existingProducts } = await req.json();

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
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `Lütfen bu POS Gün Sonu (Z Raporu), satış faturası, XML veya JSON dosyasını analiz et.

ÖNEMLİ KURAL 1 (TİTİZLİK): Belgedeki ürün kalemlerini satır satır son derece titiz bir şekilde analiz et. Satılan HİÇBİR GERÇEK ÜRÜNÜ atlama ve belgede yer almayan hiçbir ürünü uydurma.
ÖNEMLİ KURAL 2 (İSTENMEYEN KALEMLER): KDV, KDV Toplam, Ara Toplam, Genel Toplam, İndirim, Yuvarlama, Nakit, Kredi Kartı, Para Üstü gibi toplam ve ödeme satırlarını KESİNLİKLE satılan ürün (items) olarak EKLEME. Yalnızca gerçek fiziksel ürünleri/menü kalemlerini ekle.
ÖNEMLİ KURAL 3 (TAHSİLAT ANALİZİ): Fişin üzerindeki ödeme tiplerini (Nakit, Kredi Kartı vb.) analiz et ve tahsilat dağılımını ayıkla. Eğer ayrı ayrı belirtilmemişse tamamını 'cash' (Nakit) sayma, belgeden okuyabildiğin kadarını yerleştir.
ÖNEMLİ KURAL 4 (GİDER ANALİZİ): Eğer fiş veya raporda kasadan yapılan günlük masraflar/giderler (örneğin Kurye yemeği, Temizlik, Manav, Bahşiş vb.) varsa bunları ayıkla ve giderlere (expenses) ekle. Ürünlere ekleme.
ÖNEMLİ KURAL 5 (SONUNA KADAR OKUMA / ASLA KISALTMA YAPMA): JSON dizisini oluştururken ASLA tembellik (laziness) veya kısaltma yapma. Belgede örneğin 30 kalem varsa, 30 kalemin hepsini TEK TEK yaz. Yarıda kesme, atlama yapma. Tüm faturayı/raporu başından sonuna kadar %100 eksiksiz aktar.
ÖNEMLİ KURAL 6 (TARİH SEÇİMİ): Fişte 'İlk Tarih' (Başlangıç) ve 'Son Tarih' (Bitiş) olmak üzere iki farklı tarih varsa, HER ZAMAN 'İlk Tarihi' (Başlangıç Tarihini) baz al. Gece yarısını geçen vardiyalarda (örn: 8 Temmuz sabahı başlayıp 9 Temmuz gecesi 02:00'de alınan z-raporu) raporun ait olduğu asıl iş günü ilk tarihtir. Bu yüzden "date" alanına sadece İlk Tarihi yaz.
ÖNEMLİ KURAL 7 (İNDİRİM VE İKRAMLAR): Fişin altında veya üstünde yer alan 'İndirim', 'İskonto', 'İkram' gibi satırları topla ve 'discounts' objesine ekle. Eğer indirim yoksa 0 yaz.

Fişteki ürün isimlerini BİREBİR AYNI ŞEKİLDE (hiçbir harfini, noktalama işaretini veya boşluğunu değiştirmeden) çıkar.

Yanıtı SADECE aşağıdaki JSON formatında ver, ekstra hiçbir markdown (\`\`\`json vb) veya düz metin ekleme:
{
  "date": "YYYY-MM-DD",
  "total_revenue": genel_toplam_satis_sayi_olarak,
  "payment_methods": {
    "cash": nakit_tahsilat_tutari_sayi_olarak_veya_0,
    "credit_card": kredi_karti_tahsilat_tutari_sayi_olarak_veya_0,
    "other": yemek_karti_veya_diger_sayi_olarak_veya_0
  },
  "discounts": {
    "total_amount": toplam_indirim_iskonto_veya_ikram_tutari_sayi_olarak_veya_0
  },
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
      "amount": gider_tutari_sayi_olarak
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

    } catch (error: unknown) {
        console.error('Z-Report parsing error:', error);
        const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
        return NextResponse.json({ error: 'Yapay zeka Z Raporunu okurken bir hata oluştu: ' + message }, { status: 500 });
    }
}
