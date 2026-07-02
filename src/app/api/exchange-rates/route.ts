import { NextResponse } from 'next/server'

// String formatındaki Türk lirası tutarını (örn: 6.180,61) Float'a çevirir
const parseTRNumber = (val: string | undefined, fallback: number) => {
    if (!val) return fallback
    try {
        const cleaned = val.replace(/\./g, '').replace(',', '.')
        return parseFloat(cleaned) || fallback
    } catch {
        return fallback
    }
}

export async function GET() {
    try {
        // Truncgil API kullanarak doğru/canlı kurları çekiyoruz
        const response = await fetch('https://finans.truncgil.com/today.json', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': 'application/json'
            },
            next: { revalidate: 300 } // 5 dakikada bir cache'den yenile
        })
        
        let rates = { usd: 33.0, eur: 35.5, gold: 2450.0 } // Fallback kurlar

        if (response.ok) {
            const data = await response.json()
            rates = {
                usd: parseTRNumber(data?.USD?.Satış, rates.usd),
                eur: parseTRNumber(data?.EUR?.Satış, rates.eur),
                gold: parseTRNumber(data?.['gram-altin']?.Satış, rates.gold),
            }
        } else {
            console.warn('API Yanıt vermedi, varsayılan kurlar kullanılıyor. Durum:', response.status)
        }

        return NextResponse.json({ success: true, rates })

    } catch (error: any) {
        console.error('Exchange rates fetch error:', error)
        return NextResponse.json({ 
            success: true, 
            rates: { usd: 33.0, eur: 35.5, gold: 2450.0 }, 
            message: 'Kurlar çekilemedi, varsayılan kurlar gösteriliyor.' 
        })
    }
}
