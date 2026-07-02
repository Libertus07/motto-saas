import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
    try {
        const { productName, materials, subRecipes, option } = await req.json();

        if (!productName) {
            return NextResponse.json({ error: 'Ürün adı gerekli.' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'GEMINI_API_KEY bulunamadı.' }, { status: 400 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

        const materialsContext = materials?.map((m: any) => `- ${m.id} | ${m.name} | ${m.unit} | ₺${m.price_per_unit}`).join('\n') || 'Yok';
        const subRecipesContext = subRecipes?.map((s: any) => `- ${s.id} | ${s.name} | Porsiyon Maliyeti: ₺${(s.total_cost / (s.yield_quantity || 1)).toFixed(2)}`).join('\n') || 'Yok';

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Supabase URL or Key missing' }, { status: 500 });
        }
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: settings } = await supabase.from('settings').select('*');
        const takeawayRatioSetting = settings?.find(s => s.key === 'takeaway_ratio')?.value || '60';
        const takeawayRatioPercent = Number(takeawayRatioSetting);
        const takeawayRatioDecimal = takeawayRatioPercent / 100;

        const prompt = `Sen profesyonel bir restoran/kafe reçete (BOM - Bill of Materials) uzmanısın.
Kullanıcının verdiği ürün ismine göre standart bir reçete oluşturman gerekiyor.

Kullanıcının sistemindeki mevcut hammaddeler:
${materialsContext}

Kullanıcının sistemindeki mevcut yarı mamuller (soslar, karışımlar vb.):
${subRecipesContext}

KURALLAR:
1. Sana verilen HAMMADDELER veya YARI MAMULLER listesindeki malzemeleri kullanmak ZORUNDASIN. Olmayan bir malzemeyi ID'siz kafandan uydurma.
2. Birimler (unit) çok önemlidir. Örneğin süt 'Litre' ise, bir kahveye 200ml süt konuyorsa quantity 0.2 olmalıdır.
3. Sunum ve Paketleme (Take Away):
   - Kullanıcı İstatistiksel Ortalama Yöntemini seçtiği için, bu sunum malzemelerinden ${takeawayRatioDecimal} adet ekle. (Örneğin Take Away oranı tahmini %${takeawayRatioPercent} olarak kabul edildi). Yani Karton Bardak: ${takeawayRatioDecimal} adet. Eğer bu tür ürünler listede yoksa yoksay.

Yanıtı SADECE aşağıdaki JSON formatında ver, ekstra markdown (\`\`\`json vb) veya metin ekleme:
{
  "ingredients": [
    {
      "id": "kullanıcının gönderdiği listedeki id",
      "type": "material", // veya "sub_recipe"
      "name": "malzeme adı",
      "quantity": miktar_sayi_olarak_noktali_virgül_yok
    }
  ]
}`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        const jsonStr = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(jsonStr);

        return NextResponse.json(parsed);

    } catch (error: any) {
        console.error('AI Recipe Builder error:', error);
        return NextResponse.json({ error: 'Yapay zeka reçete oluştururken bir hata oluştu: ' + error.message }, { status: 500 });
    }
}
