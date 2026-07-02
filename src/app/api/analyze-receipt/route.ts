import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
    try {
        const { image, fileText, fileType, existingIngredients } = await req.json();

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
                // data:image/jpeg;base64,... veya data:application/pdf;base64,...
                const match = image.match(/^data:([a-zA-Z0-9-]+\/[a-zA-Z0-9-+.]+);base64,(.+)$/);
                if (!match) {
                    return NextResponse.json({ error: 'Geçersiz dosya formatı.' }, { status: 400 });
                }
                mimeType = match[1];
                base64Data = match[2];
            }
        }

        // API Key kontrolü
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı. Lütfen .env.local dosyasına ekleyin.' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        const prompt = `Lütfen bu belgeyi (fiş, fatura, e-fatura XML veya fiyat listesi JSON) analiz et ve içerisindeki ürün kalemlerini çıkar.
Aşağıdaki mevcut hammaddelerimle eşleşenleri "BİREBİR AYNI İSİMLE", eşleşmeyenleri ise belgedeki ismiyle çıkar:
Mevcut hammaddeler: ${existingIngredients.join(', ')}

ÖNEMLİ KURAL 1: Ürün isimlerinin sonundaki veya içindeki gereksiz noktalama işaretlerini (özellikle nokta, virgül) ve fazla boşlukları temizle. (Örn: "ALGIDA CILEK 5L.." yerine "ALGIDA CILEK 5L" yaz).

ÖNEMLİ KURAL 2: Birimleri ve miktarları sistem için standartlaştırmalısın!
Eğer ürün adında "5L", "5 Litre", "2.5 Kg", "10 Kilogram" gibi büyük paket birimleri geçiyorsa ve fişte miktar "1 Adet" (veya koli) yazıyorsa;
Bunu matematiksel olarak en küçük ortak birime çevir. 
Örneğin: 5 Litre -> quantity: 5000, unit: "Ml". Veya 2.5 Kg -> quantity: 2500, unit: "Gram".
Sıvıları her zaman "Ml", katıları "Gram" cinsinden getirmeye özen göster (tane/adet ile satılanlar hariç).

Yanıtı SADECE aşağıdaki JSON formatında ver, ekstra hiçbir markdown (\`\`\`json vb) veya düz metin ekleme:
{
  "supplier_name": "Faturayı kesen firma/tedarikçi adı (okunmuyorsa veya fişse 'Bilinmeyen Tedarikçi' yaz)",
  "supplier_phone": "Fatura/fiş üzerindeki telefon numarası (yoksa null)",
  "supplier_iban": "Fatura üzerindeki IBAN numarası (yoksa null)",
  "supplier_address": "Fatura/fiş üzerindeki adres bilgisi (yoksa null)",
  "supplier_stated_debt": faturada_yazan_eski_bakiye_veya_toplam_hesap_bakiyesi_sayı_olarak_varsa, (yoksa null),
  "invoice_date": "YYYY-MM-DD",
  "total_amount": genel_toplam_tutar_sayi_olarak,
  "items": [
    {
      "name": "ürün adı",
      "category": "Tahmini ürün kategorisi (örn: Süt Ürünleri, Sebze/Meyve, Temizlik, İçecek vb.)",
      "quantity": miktar_sayı_olarak,
      "unit": "birim (kg/litre/adet/paket vb)",
      "totalPrice": toplam_fiyat_sayı_olarak,
      "unitPrice": birim_fiyat_sayı_olarak
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
        
        // Yanıtın başındaki/sonundaki olası markdown bloklarını temizle
        const jsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        return NextResponse.json(parsed);

    } catch (error: any) {
        console.error('Receipt parsing error:', error);
        return NextResponse.json({ error: 'Yapay zeka fişi okurken bir hata oluştu: ' + error.message }, { status: 500 });
    }
}
