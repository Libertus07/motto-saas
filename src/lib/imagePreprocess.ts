/**
 * imagePreprocess.ts
 *
 * Client-side receipt/invoice photo cleanup, run entirely in the browser
 * before the image is sent to the Gemini API. This fixes two things at once:
 *
 *   1. Photos taken at an angle / with a lot of background (granite counter,
 *      tiles, etc.) get auto-rotated, cropped tight to the paper, and
 *      contrast-enhanced -> better Gemini extraction accuracy.
 *   2. The output is re-compressed as JPEG, which reliably brings a 8-12MB
 *      phone photo under the ~3MB Vercel request-body limit, instead of
 *      hard-rejecting the upload.
 *
 * Usage (see fis-yukle/page.tsx and z-raporu/page.tsx for wiring):
 *
 *   const { dataUrl, sizeBytes } = await preprocessReceiptImage(file)
 *   setImage(dataUrl)
 */

export interface PreprocessResult {
  dataUrl: string
  sizeBytes: number
  width: number
  height: number
}

export interface PreprocessOptions {
  /** Max output width in px. Receipts rarely need more than this to stay legible. */
  maxWidth?: number
  /** JPEG quality 0-1 */
  quality?: number
  /** Brightness threshold (0-255) used to tell "paper" from "background" when cropping */
  cropThreshold?: number
}

const DEFAULTS: Required<PreprocessOptions> = {
  maxWidth: 1600,
  quality: 0.72,
  cropThreshold: 150
}

/** Load a File into a canvas, respecting EXIF orientation (phone photos are often rotated). */
async function loadOriented(file: File): Promise<HTMLCanvasElement> {
  try {
    // Modern browsers (incl. iOS Safari 15+) auto-apply EXIF orientation here.
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    canvas.getContext('2d')!.drawImage(bmp, 0, 0)
    return canvas
  } catch {
    // Fallback for browsers without createImageBitmap orientation support.
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

/**
 * Finds the paper's bounding box by looking for rows/columns that are
 * mostly bright (paper) vs. mostly dark (counter/table/background), then
 * crops to it. Falls back to the original canvas if detection is inconclusive
 * (e.g. a screenshot or a photo that's already tightly cropped).
 */
function autoCrop(canvas: HTMLCanvasElement, threshold: number): HTMLCanvasElement {
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
  let top = 0,
    bottom = sh - 1,
    left = 0,
    right = sw - 1
  while (top < sh && rowCount[top] < rowThresh) top++
  while (bottom > 0 && rowCount[bottom] < rowThresh) bottom--
  while (left < sw && colCount[left] < colThresh) left++
  while (right > 0 && colCount[right] < colThresh) right--

  if (top >= bottom || left >= right) return canvas // detection failed, keep original

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

/** Mild contrast/brightness boost so faint thermal-printer ink reads clearly. */
function enhance(canvas: HTMLCanvasElement): HTMLCanvasElement {
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

function resizeToMaxWidth(canvas: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement {
  if (canvas.width <= maxWidth) return canvas
  const ratio = maxWidth / canvas.width
  const out = document.createElement('canvas')
  out.width = maxWidth
  out.height = Math.round(canvas.height * ratio)
  out.getContext('2d')!.drawImage(canvas, 0, 0, out.width, out.height)
  return out
}

/**
 * Main entry point: takes a raw File from an <input type="file">,
 * returns a cleaned-up, compressed JPEG data URL ready to send to
 * /api/analyze-receipt or /api/analyze-z-report.
 *
 * Non-image files should bypass this and use the existing FileReader
 * logic (xml/json/xlsx/pdf handling stays exactly as-is).
 */
export async function preprocessReceiptImage(
  file: File,
  options: PreprocessOptions = {}
): Promise<PreprocessResult> {
  const opts = { ...DEFAULTS, ...options }

  let canvas = await loadOriented(file)
  canvas = autoCrop(canvas, opts.cropThreshold)
  canvas = enhance(canvas)
  canvas = resizeToMaxWidth(canvas, opts.maxWidth)

  const dataUrl = canvas.toDataURL('image/jpeg', opts.quality)
  const sizeBytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)

  return { dataUrl, sizeBytes, width: canvas.width, height: canvas.height }
}
