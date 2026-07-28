/**
 * Motto SaaS - İstemci Tarafı Akıllı Görsel Ön İşleme Engine'i (v2 Ultra-Premium)
 */

export interface PreprocessResult {
  dataUrl: string
  sizeBytes: number
  width: number
  height: number
  readinessScore: number
  readinessLabel: string
}

export type FilterPreset = 'original' | 'enhanced' | 'bw'

export interface PreprocessOptions {
  maxWidth?: number
  quality?: number
  cropThreshold?: number
  rotationAngle?: number // 0, 90, 180, 270
  doCrop?: boolean
  preset?: FilterPreset
  brightness?: number // -50 to +50
  contrast?: number   // 0.5 to 2.5
}

const DEFAULTS: Required<PreprocessOptions> = {
  maxWidth: 1600,
  quality: 0.75,
  cropThreshold: 150,
  rotationAngle: 0,
  doCrop: true,
  preset: 'enhanced',
  brightness: 0,
  contrast: 1.0
}

/** Convert Base64 dataUrl into a standard File object for Supabase Storage. */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',')
  const mimeMatch = arr[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], filename, { type: mime })
}

/** Load a File into a canvas, respecting EXIF orientation. */
export async function loadOriented(file: File): Promise<HTMLCanvasElement> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    canvas.getContext('2d')!.drawImage(bmp, 0, 0)
    return canvas
  } catch {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        canvas.getContext('2d')!.drawImage(img, 0, 0)
        resolve(canvas)
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
}

/** Rotate canvas by 90, 180, or 270 degrees. */
export function rotateCanvas(canvas: HTMLCanvasElement, angleDegrees: number): HTMLCanvasElement {
  const normalized = ((angleDegrees % 360) + 360) % 360
  if (normalized === 0) return canvas

  const rad = (normalized * Math.PI) / 180
  const is90or270 = normalized === 90 || normalized === 270

  const out = document.createElement('canvas')
  out.width = is90or270 ? canvas.height : canvas.width
  out.height = is90or270 ? canvas.width : canvas.height

  const ctx = out.getContext('2d')!
  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
  return out
}

/** Finds paper bounding box and crops tight to it. */
export function autoCrop(canvas: HTMLCanvasElement, threshold: number): HTMLCanvasElement {
  const w = canvas.width
  const h = canvas.height
  const scale = Math.min(1, 300 / Math.max(w, h))
  const sw = Math.max(1, Math.round(w * scale))
  const sh = Math.max(1, Math.round(h * scale))

  const small = document.createElement('canvas')
  small.width = sw
  small.height = sh
  const sctx = small.getContext('2d')!
  sctx.drawImage(canvas, 0, 0, sw, sh)
  const data = sctx.getImageData(0, 0, sw, sh).data

  const rowCount = new Array(sh).fill(0)
  const colCount = new Array(sw).fill(0)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = (y * sw + x) * 4
      const bright = (data[idx] + data[idx + 1] + data[idx + 2]) / 3
      if (bright > threshold) {
        rowCount[y]++
        colCount[x]++
      }
    }
  }

  const rowThresh = sw * 0.3
  const colThresh = sh * 0.3
  let top = 0, bottom = sh - 1, left = 0, right = sw - 1
  while (top < sh && rowCount[top] < rowThresh) top++
  while (bottom > 0 && rowCount[bottom] < rowThresh) bottom--
  while (left < sw && colCount[left] < colThresh) left++
  while (right > 0 && colCount[right] < colThresh) right--

  if (top >= bottom || left >= right) return canvas

  const inv = 1 / scale
  const cropX = Math.max(0, Math.floor(left * inv) - 6)
  const cropY = Math.max(0, Math.floor(top * inv) - 6)
  const cropW = Math.min(w - cropX, Math.ceil((right - left) * inv) + 12)
  const cropH = Math.min(h - cropY, Math.ceil((bottom - top) * inv) + 12)

  const out = document.createElement('canvas')
  out.width = cropW
  out.height = cropH
  out.getContext('2d')!.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)
  return out
}

/** CamScanner-style Black & White Thermal Scanner thresholding filter. */
export function applyBwThreshold(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data
  
  // Calculate average luminance for adaptive threshold
  let sumLuma = 0
  for (let i = 0; i < d.length; i += 4) {
    sumLuma += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
  }
  const avgLuma = sumLuma / (d.length / 4)
  const threshold = Math.min(210, Math.max(120, avgLuma * 0.92))

  for (let i = 0; i < d.length; i += 4) {
    const luma = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
    const val = luma < threshold ? 0 : 255
    d[i] = val
    d[i + 1] = val
    d[i + 2] = val
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas
}

/** Boost contrast and brightness for faint thermal print. */
export function enhance(
  canvas: HTMLCanvasElement,
  userBrightness: number = 0,
  userContrast: number = 1.0
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data
  const contrast = 1.18 * userContrast
  const brightness = 6 + userBrightness

  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = d[i + c]
      v = (v - 128) * contrast + 128 + brightness
      d[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
    }
  }
  ctx.putImageData(imgData, 0, 0)
  return canvas
}

export function resizeToMaxWidth(canvas: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  if (canvas.width <= maxWidth) return canvas
  const ratio = maxWidth / canvas.width
  const out = document.createElement('canvas')
  out.width = maxWidth
  out.height = Math.round(canvas.height * ratio)
  out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

/** Calculate AI OCR Readiness Score (0-100%). */
export function calculateAiReadinessScore(canvas: HTMLCanvasElement): { score: number; label: string } {
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const imgData = ctx.getImageData(0, 0, w, h)
  const d = imgData.data

  let contrastSum = 0
  let sampleCount = 0

  // Measure local variance / contrast
  for (let i = 0; i < d.length - 16; i += 32) {
    const luma1 = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
    const luma2 = d[i + 16] * 0.299 + d[i + 17] * 0.587 + d[i + 18] * 0.114
    contrastSum += Math.abs(luma1 - luma2)
    sampleCount++
  }

  const avgContrast = sampleCount > 0 ? contrastSum / sampleCount : 0
  let rawScore = Math.min(100, Math.round(avgContrast * 2.8 + 50))
  if (w < 800) rawScore = Math.max(30, rawScore - 15)

  let label = '🟢 Mükemmel Netlik - Yapay zeka fişi kusursuz okuyacak'
  if (rawScore < 60) label = '🔴 Düşük Netlik - Lütfen "Termal B&W" modunu açın'
  else if (rawScore < 80) label = '🟡 Orta Netlik - Kontrast artırılması önerilir'

  return { score: rawScore, label }
}

/** Preprocess receipt photo with options. */
export async function preprocessReceiptImage(
  file: File,
  options: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const opts = { ...DEFAULTS, ...options }

  let canvas = await loadOriented(file)

  if (opts.rotationAngle && opts.rotationAngle !== 0) {
    canvas = rotateCanvas(canvas, opts.rotationAngle)
  }

  if (opts.doCrop) {
    canvas = autoCrop(canvas, opts.cropThreshold)
  }

  if (opts.preset === 'bw') {
    canvas = applyBwThreshold(canvas)
  } else if (opts.preset === 'enhanced') {
    canvas = enhance(canvas, opts.brightness, opts.contrast)
  }

  canvas = resizeToMaxWidth(canvas, opts.maxWidth)

  const { score: readinessScore, label: readinessLabel } = calculateAiReadinessScore(canvas)

  const dataUrl = canvas.toDataURL('image/jpeg', opts.quality)
  const sizeBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)

  return {
    dataUrl,
    sizeBytes,
    width: canvas.width,
    height: canvas.height,
    readinessScore,
    readinessLabel
  }
}

/**
 * Merges multiple processed image dataUrls vertically into a single unified long receipt image.
 * Ideal for multi-part long Z-reports or multi-page receipts.
 */
export async function mergeImagesVertically(dataUrls: string[]): Promise<PreprocessResult> {
  if (dataUrls.length === 0) {
    throw new Error('Birleştirilecek görsel bulunamadı.')
  }

  if (dataUrls.length === 1) {
    const sizeBytes = Math.round((dataUrls[0].length * 3) / 4)
    return {
      dataUrl: dataUrls[0],
      sizeBytes,
      width: 0,
      height: 0,
      readinessScore: 95,
      readinessLabel: '🟢 Tek Parça Belge'
    }
  }

  const loadedImgs = await Promise.all(
    dataUrls.map(
      url =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = url
        })
    )
  )

  const targetW = Math.max(...loadedImgs.map(i => i.width))
  let totalH = 0
  const scaledHeights = loadedImgs.map(img => {
    const scaledH = Math.round(img.height * (targetW / img.width))
    totalH += scaledH
    return scaledH
  })

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = totalH
  const ctx = canvas.getContext('2d')!

  // Fill background white
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, targetW, totalH)

  let currentY = 0
  loadedImgs.forEach((img, idx) => {
    const h = scaledHeights[idx]
    ctx.drawImage(img, 0, currentY, targetW, h)
    currentY += h
  })

  const mergedDataUrl = canvas.toDataURL('image/jpeg', 0.85)
  const sizeBytes = Math.round((mergedDataUrl.length * 3) / 4)

  return {
    dataUrl: mergedDataUrl,
    sizeBytes,
    width: targetW,
    height: totalH,
    readinessScore: 100,
    readinessLabel: `🟢 Birleştirildi (${loadedImgs.length} Parça Fiş/Z-Raporu)`
  }
}
