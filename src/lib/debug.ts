const isDev = process.env.NODE_ENV !== 'production'

export function devLog(...args: unknown[]) {
    if (isDev) console.log(...args)
}

export function devError(...args: unknown[]) {
    if (isDev) console.error(...args)
    // Prod'da izlemek istenirse buraya Sentry benzeri bir servise gönderim eklenebilir
}
