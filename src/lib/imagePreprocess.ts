/**
 * Motto SaaS - İstemci Tarafı Akıllı Görsel Ön İşleme Engine'i
 */

export interface PreprocessResult {
  dataUrl: string
  sizeBytes: number
  width: number
  height: number
}

export interface PreprocessOptions {
  maxWidth?: number
  quality?: number
  cropThreshold?: number
  rotationAngle?: number // 0, 90, 180, 270
  doCrop?: boolean
  doEnhance?: boolean
}

const DEFAULTS: Required<PreprocessOptions> = {
  maxWidth: 1600,
  quality: 0.75,
  cropThreshold: 150,
  rotationAngle: 0,
  doCrop: true,
  doEnhance: true
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

/** Boost contrast and brightness for faint thermal print. */
export function enhance(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = imgData.data
  const contrast = 1.18
  const brightness = 6
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

  if (opts.doEnhance) {
    canvas = enhance(canvas)
  }

  canvas = resizeToMaxWidth(canvas, opts.maxWidth)

  const dataUrl = canvas.toDataURL('image/jpeg', opts.quality)
  const sizeBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)

  return { dataUrl, sizeBytes, width: canvas.width, height: canvas.height }
}
