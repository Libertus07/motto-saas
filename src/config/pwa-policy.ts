const FRONTEND_NAVIGATION_WORKER = /^\/?swe-worker-[0-9a-f]{8,64}\.js$/

export async function excludeFrontendNavigationWorkerFromPrecache<T extends { url: string }>(entries: T[]) {
  return {
    manifest: entries.filter((entry) => !FRONTEND_NAVIGATION_WORKER.test(entry.url)),
    warnings: [] as string[],
  }
}
