import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
    const cookieStore = await cookies()
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Eğer server componenti içinde çağrılırsa set edilemeyebilir, sorun değil
                    }
                },
            },
        }
    )
}

// Her route'un başında çağırılacak: Kullanıcı yoksa veya hata varsa 401 için kontrol sağlar
export async function requireUser() {
    const supabase = await createServerSupabase()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return { user: null, supabase }
    }

    return { user, supabase }
}
