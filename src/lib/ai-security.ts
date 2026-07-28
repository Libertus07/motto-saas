/**
  Motto SaaS - AI & SSRF Security Utilities
 */

/**
 * Validates external image URLs against SSRF (Server-Side Request Forgery) attacks.
 * Blocks non-HTTPS protocols, localhost, and private/internal IP ranges.
 */
export function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return false
    const host = parsed.hostname.toLowerCase()
    if (
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}
