export function openDocumentInNewTab(url: string): boolean {
  const newTab = window.open('about:blank', '_blank')
  if (!newTab) return false

  newTab.opener = null

  try {
    let destination = url

    if (url.startsWith('data:')) {
      const parts = url.split(',')
      const mimeMatch = parts[0].match(/:(.*?);/)
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
      const binary = atob(parts[1])
      let index = binary.length
      const bytes = new Uint8Array(index)

      while (index--) {
        bytes[index] = binary.charCodeAt(index)
      }

      destination = URL.createObjectURL(new Blob([bytes], { type: mime }))
    }

    newTab.location.replace(destination)
    return true
  } catch {
    newTab.close()
    return false
  }
}
