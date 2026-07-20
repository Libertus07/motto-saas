import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireUser } from '@/lib/supabase-server';
import { devLog, devError } from '@/lib/debug';

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
        const { user, supabase } = await requireUser();
        if (!user) {
            return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
        }

        // AI Kota Kontrolü (SEC-104)
        const { data: allowed } = await supabase.rpc('check_ai_quota');
        if (!allowed) {
            return NextResponse.json({ error: 'Günlük limit doldu, yarın tekrar deneyin.' }, { status: 429 });
        }

        const { image, fileText, fileType, existingIngredients } = await req.json();

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
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const prompt = `Lütfen bu belgeyi (fiş, fatura, e-fatura XML veya fiyat listesi JSON) analiz et ve içerisindeki ürün kalemlerini DİKKATLİCE çıkar.

Aşağıdaki mevcut hammaddelerimle eşleşenleri "BİREBİR AYNI İSİMLE", eşleşmeyenleri ise belgedeki ismiyle çıkar:
Mevcut hammaddeler: ${existingIngredients.join(', ')}

ÖNEMLİ KURAL 1 (TİTİZLİK VE EKSİKSİZLİK): Belgedeki ürün kalemlerini satır satır son derece titiz bir şekilde analiz et. HİÇBİR gerçek ürünü atlama (eksik ürün bırakma) ve belgede YER ALMAYAN hiçbir ürünü uydurma (fazla ürün ekleme).
ÖNEMLİ KURAL 2 (İSTENMEYEN KALEMLER): KDV, Ara Toplam, Genel Toplam, İndirim, Yuvarlama, Nakit, Kredi Kartı, Para Üstü, Tutar, Matrah gibi toplam ve ödeme satırlarını KESİNLİKLE ürün (items) olarak EKLEME. Yalnızca fiziksel mal/hizmet kalemlerini ekle.
ÖNEMLİ KURAL 3 (İSİM TEMİZLİĞİ): Ürün isimlerinin sonundaki veya içindeki gereksiz noktalama işaretlerini (özellikle nokta, virgül, yıldız), KDV oranlarını (örn: %1, %10) ve fazla boşlukları temizle. (Örn: "ALGIDA CILEK 5L.. %1" yerine "ALGIDA CILEK 5L" yaz).
ÖNEMLİ KURAL 4 (BİRİM VE MİKTAR DÖNÜŞÜMÜ): Belgedeki miktar Kg, Gram, Litre, Ml, Adet olarak açıkça belirtilmişse BUNU KESİNLİKLE DEĞİŞTİRME. Fişte miktar olarak ne yazıyorsa (örn: 20 Kg) birebir aynı Miktar (20) ve Birimi (Kg) kullan. Asla 1000 ile çarpıp Gram'a çevirmeye kalkma! SADECE ürünün isminde "5L", "10 Kg" gibi dev paket bilgisi varsa VE fişteki miktar "1 Adet/Koli" yazıyorsa; o zaman paketin içindeki net miktarı bul (Örn: 1 Adet 5L sıvı -> quantity: 5000, unit: "Ml"). Bunun dışındaki tüm durumlarda belgedeki birimi koru.
ÖNEMLİ KURAL 5 (FİYAT VE KDV DAHİL MATEMATİK): Ürünlerin faturasında "KDV Hariç" (Mal/Hizmet Tutarı) yazıyorsa ve KDV ayrıca hesaplanıyorsa, o ürünün KDV'sini KESİNLİKLE üzerine EKLEYEREK (KDV Dahil) "totalPrice" değerini yaz. Eğer satırda zaten "Vergiler Dahil" veya "KDV Dahil" yazıyorsa onu kullan. Sonuç olarak totalPrice KESİNLİKLE KDV DAHİL SATIŞ FİYATI olmalıdır. Birim fiyatı (unitPrice) ise KDV dahil toplam tutarı (totalPrice) miktara (quantity) bölerek küsuratlı şekilde (asla yuvarlamadan) bul. quantity * unitPrice = totalPrice matematiği kuruşu kuruşuna tutmalıdır.
ÖNEMLİ KURAL 6 (BEDELSİZ PROMOSYONLAR VE İADELER): Fiyatı 0.00 olan (bedelsiz/promosyon) kalemleri listeye fiyatı 0 olarak DAHİL ET. ANCAK, eksi (-) değerli olan veya satırda/yanında kalemle "İADE" (return) yazan veya iptal edilmiş ürünleri KESİNLİKLE LİSTEYE EKLEME. İade ürünlerini tamamen yok say ve atla.
ÖNEMLİ KURAL 7 (SONUNA KADAR OKUMA / ASLA KISALTMA YAPMA): JSON dizisini oluştururken ASLA tembellik (laziness) veya kısaltma yapma. Belgede örneğin 30 kalem varsa, 30 kalemin hepsini TEK TEK yaz. Yarıda kesme, atlama yapma. Tüm faturayı başından sonuna kadar %100 eksiksiz aktar.
ÖNEMLİ KURAL 8 (GERÇEK / GÜNCEL GENEL TOPLAM VE BAKİYE): Faturada iade/iptal edilen ürünler varsa, bu ürünlerin tutarları ana faturadan (matbu tutardan) DÜŞÜLMELİDİR. Eğer faturanın üzerine el yazısıyla güncel/net bir toplam (örn: "Güncel 13.128") yazılmışsa, "total_amount" alanına KESİNLİKLE bu elle yazılmış güncel rakamı yaz (elle yazılmamışsa iade edilen kalemleri basılı toplam tutardan çıkarıp yaz).
Aynı şekilde, eğer faturada matbu olarak yazılmış bir "Sonraki Bakiye" veya "Toplam Borç" (supplier_stated_debt) varsa ve iade/iptal kalemleri faturadan elle düşüldüyse; matbu bakiyeyi direkt KOPYALAMA. Matbu "Sonraki Bakiye" içinden iade edilen ürünlerin tutarını matematiksel olarak çıkartarak (veya Önceki Bakiye + Güncel Net Tutar formülüyle) DOĞRU (giden iadenin düşülmüş olduğu) GÜNCEL SONRAKİ BAKİYEYİ bularak "supplier_stated_debt" alanına yaz.

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
      "quantity": miktar_sadece_rakam_olarak,
      "unit": "Faturada Miktarın yanında yazan birim. KESİNLİKLE uydurma veya tahmin etme! Satırda 'ADET' yazıyorsa 'Adet', 'KG' yazıyorsa 'Kg', 'KUTU' veya 'KOLİ' yazıyorsa mutlaka 'Kutu' veya 'Koli' yaz. Eğer birim yoksa 'Adet' yaz, asla kafana göre 'Gram' yazma.",
      "boxMultiplier": "Eğer ürün Kutu, Koli veya Paket ise ve fişte içinde kaç adet olduğu yazıyorsa (örn: '1 Koli 24 Adet', '1x24'), bu sayıyı sadece rakam olarak buraya yaz. Eğer yazmıyorsa veya emin değilsen null bırak.",
      "totalPrice": toplam_tutar_sadece_rakam_olarak,
      "unitPrice": birim_fiyat_sadece_rakam_olarak
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

    } catch (error: unknown) {
        devError('Receipt parsing error:', error);
        const message = error instanceof Error ? error.message : 'Bilinmeyen hata';
        return NextResponse.json({ error: 'Yapay zeka fişi okurken bir hata oluştu: ' + message }, { status: 500 });
    }
}
