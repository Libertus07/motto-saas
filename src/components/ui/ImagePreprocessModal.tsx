'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  preprocessReceiptImage,
  PreprocessResult,
  FilterPreset
} from '@/lib/imagePreprocess'

interface ImagePreprocessModalProps {
  isOpen: boolean
  file: File | null
  onClose: () => void
  onConfirm: (result: PreprocessResult) => void
}

export function ImagePreprocessModal({
  isOpen,
  file,
  onClose,
  onConfirm
}: ImagePreprocessModalProps) {
  const [loading, setLoading] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [doCrop, setDoCrop] = useState(true)
  const [preset, setPreset] = useState<FilterPreset>('enhanced')
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(1.0)
  const [showOriginal, setShowOriginal] = useState(false)

  // Hover Büyüteç Lensi State
  const [magnifier, setMagnifier] = useState<{
    show: boolean
    x: number
    y: number
    imgX: number
    imgY: number
  }>({ show: false, x: 0, y: 0, imgX: 0, imgY: 0 })

  const imgRef = useRef<HTMLImageElement>(null)
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [processedResult, setProcessedResult] = useState<PreprocessResult | null>(null)

  useEffect(() => {
    if (!file || !isOpen) return

    const origUrl = URL.createObjectURL(file)
    setOriginalUrl(origUrl)
    setRotation(0)
    setDoCrop(true)
    setPreset('enhanced')
    setBrightness(0)
    setContrast(1.0)
    setShowOriginal(false)

    processImage(file, 0, true, 'enhanced', 0, 1.0)

    return () => {
      URL.revokeObjectURL(origUrl)
    }
  }, [file, isOpen])

  const processImage = async (
    targetFile: File,
    rot: number,
    crop: boolean,
    prst: FilterPreset,
    bright: number,
    cntrst: number
  ) => {
    setLoading(true)
    try {
      const res = await preprocessReceiptImage(targetFile, {
        rotationAngle: rot,
        doCrop: crop,
        preset: prst,
        brightness: bright,
        contrast: cntrst
      })
      setProcessedResult(res)
    } catch (err) {
      console.error('Preprocessing failed, falling back to raw file:', err)
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setProcessedResult({
          dataUrl,
          sizeBytes: targetFile.size,
          width: 0,
          height: 0,
          readinessScore: 70,
          readinessLabel: '🟡 Orijinal Belge Okunuyor'
        })
      }
      reader.readAsDataURL(targetFile)
    } finally {
      setLoading(false)
    }
  }

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360
    setRotation(nextRot)
    if (file) processImage(file, nextRot, doCrop, preset, brightness, contrast)
  }

  const handleToggleCrop = () => {
    const nextCrop = !doCrop
    setDoCrop(nextCrop)
    if (file) processImage(file, rotation, nextCrop, preset, brightness, contrast)
  }

  const handlePresetChange = (newPreset: FilterPreset) => {
    setPreset(newPreset)
    if (file) processImage(file, rotation, doCrop, newPreset, brightness, contrast)
  }

  const handleBrightnessChange = (val: number) => {
    setBrightness(val)
    if (file) processImage(file, rotation, doCrop, preset, val, contrast)
  }

  const handleContrastChange = (val: number) => {
    setContrast(val)
    if (file) processImage(file, rotation, doCrop, preset, brightness, val)
  }

  // Hover Büyüteç Lens Mantığı
  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Percentages
    const imgX = (x / rect.width) * 100
    const imgY = (y / rect.height) * 100

    setMagnifier({
      show: true,
      x: e.clientX,
      y: e.clientY,
      imgX,
      imgY
    })
  }

  const handleMouseLeave = () => {
    setMagnifier(prev => ({ ...prev, show: false }))
  }

  if (!isOpen || !file) return null

  const origSizeMB = (file.size / (1024 * 1024)).toFixed(2)
  const procSizeKB = processedResult
    ? (processedResult.sizeBytes / 1024).toFixed(0)
    : '0'
  const savingsPct = processedResult
    ? Math.max(0, Math.round((1 - processedResult.sizeBytes / file.size) * 100))
    : 0

  const activeSrc = showOriginal && originalUrl ? originalUrl : processedResult?.dataUrl

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden text-stone-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-stone-800 bg-stone-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-stone-100 text-lg">Akıllı Görsel İyileştirme Stüdyosu</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                  v2 Ultra-Premium
                </span>
              </div>
              <p className="text-xs text-stone-400">Yapay Zeka (Gemini OCR) okuma başarısını %98'e çıkarmak için fişi düzenleyin.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* AI Readiness & Optimization Badges */}
        <div className="px-6 py-2 bg-stone-950/90 border-b border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {processedResult && (
            <div className="flex items-center gap-2">
              <span className="font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                AI Okunabilirlik: %{processedResult.readinessScore}
              </span>
              <span className="text-stone-300 font-medium">{processedResult.readinessLabel}</span>
            </div>
          )}

          <div className="flex items-center gap-3 ml-auto">
            <span className="text-stone-400">Orijinal: <strong className="text-stone-200">{origSizeMB} MB</strong></span>
            <span className="text-stone-600">➔</span>
            <span className="text-amber-400">Optimize: <strong className="text-emerald-400">{procSizeKB} KB</strong></span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
              %{savingsPct} Tasarruf 🟢
            </span>
          </div>
        </div>

        {/* Canvas Preview Area with Magnifier */}
        <div className="relative flex-1 min-h-[300px] max-h-[50vh] p-4 bg-stone-950/50 flex items-center justify-center overflow-hidden">
          {loading && (
            <div className="absolute inset-0 z-20 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center gap-3 text-amber-400 font-medium text-sm">
              <span className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              Görsel İşleniyor & Netleştiriliyor...
            </div>
          )}

          {activeSrc && (
            <div className="relative cursor-crosshair">
              <img
                ref={imgRef}
                src={activeSrc}
                alt="Receipt Preview"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="max-h-[46vh] max-w-full object-contain rounded-lg shadow-xl border border-stone-800"
              />
            </div>
          )}

          {/* Floating Live Magnifier Lens */}
          {magnifier.show && activeSrc && (
            <div
              style={{
                top: `${magnifier.y - 80}px`,
                left: `${magnifier.x + 20}px`,
                backgroundImage: `url(${activeSrc})`,
                backgroundPosition: `${magnifier.imgX}% ${magnifier.imgY}%`,
                backgroundSize: '300%'
              }}
              className="pointer-events-none fixed z-30 w-36 h-36 rounded-full border-2 border-amber-400 shadow-2xl bg-no-repeat bg-stone-900 overflow-hidden ring-4 ring-black/40"
            >
              <div className="absolute bottom-1 right-2 text-[10px] bg-stone-900/80 px-1.5 py-0.5 rounded text-amber-400 font-mono font-bold">
                2x Büyüteç
              </div>
            </div>
          )}
        </div>

        {/* Presets & Fine-Tuning Control Bar */}
        <div className="p-4 bg-stone-950/90 border-t border-stone-800 space-y-3">
          
          {/* Preset Buttons & Sliders */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
            
            {/* Presets */}
            <div className="flex items-center gap-1.5 bg-stone-900 p-1 rounded-xl border border-stone-800">
              <button
                onClick={() => handlePresetChange('original')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  preset === 'original'
                    ? 'bg-amber-500 text-stone-950 font-bold shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                🎨 Renkli (Orijinal)
              </button>
              <button
                onClick={() => handlePresetChange('enhanced')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  preset === 'enhanced'
                    ? 'bg-amber-500 text-stone-950 font-bold shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                ☀️ Yüksek Kontrast
              </button>
              <button
                onClick={() => handlePresetChange('bw')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  preset === 'bw'
                    ? 'bg-amber-500 text-stone-950 font-bold shadow'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                ⚡ Termal B&W Tarayıcı
              </button>
            </div>

            {/* Sliders */}
            <div className="flex items-center gap-4 bg-stone-900 px-4 py-2 rounded-xl border border-stone-800">
              <div className="flex items-center gap-2">
                <span className="text-stone-400 font-medium">Kontrast:</span>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={contrast}
                  onChange={e => handleContrastChange(parseFloat(e.target.value))}
                  className="w-24 accent-amber-500 cursor-pointer"
                />
                <span className="w-8 text-stone-300 font-mono text-[11px]">{Math.round(contrast * 100)}%</span>
              </div>

              <div className="h-4 w-px bg-stone-800" />

              <div className="flex items-center gap-2">
                <span className="text-stone-400 font-medium">Parlaklık:</span>
                <input
                  type="range"
                  min="-40"
                  max="40"
                  step="5"
                  value={brightness}
                  onChange={e => handleBrightnessChange(parseInt(e.target.value))}
                  className="w-24 accent-amber-500 cursor-pointer"
                />
                <span className="w-8 text-stone-300 font-mono text-[11px]">{brightness > 0 ? `+${brightness}` : brightness}</span>
              </div>
            </div>

          </div>

          {/* Bottom Toolbar & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRotate}
                className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                🔄 90° Döndür ({rotation}°)
              </button>

              <button
                onClick={handleToggleCrop}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  doCrop
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-stone-800 border-stone-700 text-stone-400'
                }`}
              >
                📐 Otomatik Kırpma ({doCrop ? 'Açık' : 'Kapalı'})
              </button>

              <button
                onMouseDown={() => setShowOriginal(true)}
                onMouseUp={() => setShowOriginal(false)}
                onMouseLeave={() => setShowOriginal(false)}
                className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-xs font-medium transition-colors active:bg-stone-600"
              >
                👁️ Basılı Tut: Orijinali Gör
              </button>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium transition-colors"
              >
                İptal
              </button>

              <button
                disabled={loading || !processedResult}
                onClick={() => {
                  if (processedResult) onConfirm(processedResult)
                }}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                ✨ Yapay Zekaya Gönder ve Çözümle
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
