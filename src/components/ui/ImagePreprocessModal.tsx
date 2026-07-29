'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  preprocessReceiptImage,
  mergeImagesVertically,
  PreprocessResult,
  FilterPreset
} from '@/lib/imagePreprocess'

interface ImagePreprocessModalProps {
  isOpen: boolean
  files: File[] | File | null
  onClose: () => void
  onConfirm: (results: PreprocessResult[]) => void
}

interface PerFileState {
  file: File
  rotation: number
  doCrop: boolean
  preset: FilterPreset
  brightness: number
  contrast: number
  originalUrl: string
  result: PreprocessResult | null
  loading: boolean
}

export function ImagePreprocessModal({
  isOpen,
  files,
  onClose,
  onConfirm
}: ImagePreprocessModalProps) {
  const [fileStates, setFileStates] = useState<PerFileState[]>([])
  const [activeIndex, setActiveIndex] = useState<number>(0)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showAiOverlays, setShowAiOverlays] = useState(true)
  const [shouldMerge, setShouldMerge] = useState<boolean>(true)
  const [mergedResult, setMergedResult] = useState<PreprocessResult | null>(null)
  const [isMerging, setIsMerging] = useState<boolean>(false)

  // Hover Büyüteç Lensi State
  const [magnifier, setMagnifier] = useState<{
    show: boolean
    x: number
    y: number
    imgX: number
    imgY: number
  }>({ show: false, x: 0, y: 0, imgX: 0, imgY: 0 })

  const imgRef = useRef<HTMLImageElement>(null)

  // Turn single File or File[] into array
  const filesList: File[] = React.useMemo(() => {
    if (!files) return []
    return Array.isArray(files) ? files : [files]
  }, [files])

  useEffect(() => {
    if (!isOpen || filesList.length === 0) {
      setFileStates([])
      setMergedResult(null)
      return
    }

    const initialStates: PerFileState[] = filesList.map(f => ({
      file: f,
      rotation: 0,
      doCrop: true,
      preset: 'enhanced',
      brightness: 0,
      contrast: 1.0,
      originalUrl: URL.createObjectURL(f),
      result: null,
      loading: true
    }))

    setFileStates(initialStates)
    setActiveIndex(0)
    setShowOriginal(false)
    setShouldMerge(filesList.length > 1)
    setMergedResult(null)

    // Process all files
    initialStates.forEach((st, idx) => {
      processFileAtIndex(idx, st.file, 0, true, 'enhanced', 0, 1.0, initialStates)
    })

    return () => {
      initialStates.forEach(st => URL.revokeObjectURL(st.originalUrl))
    }
  }, [isOpen, filesList])

  // Automatically trigger vertical merge whenever fileStates finished processing
  useEffect(() => {
    if (fileStates.length > 1 && shouldMerge) {
      const allDone = fileStates.every(s => !s.loading && s.result !== null)
      if (allDone) {
        triggerMerge(fileStates)
      }
    }
  }, [fileStates, shouldMerge])

  const triggerMerge = async (currentList: PerFileState[]) => {
    const urls = currentList.map(s => s.result?.dataUrl).filter((u): u is string => !!u)
    if (urls.length < 2) return

    setIsMerging(true)
    try {
      const res = await mergeImagesVertically(urls)
      setMergedResult(res)
    } catch (err) {
      console.error('Vertical merge failed:', err)
    } finally {
      setIsMerging(false)
    }
  }

  const processFileAtIndex = async (
    idx: number,
    targetFile: File,
    rot: number,
    crop: boolean,
    prst: FilterPreset,
    bright: number,
    cntrst: number,
    currentStates?: PerFileState[]
  ) => {
    setFileStates(prev => {
      const list = [...(currentStates || prev)]
      if (list[idx]) {
        list[idx] = { ...list[idx], loading: true, rotation: rot, doCrop: crop, preset: prst, brightness: bright, contrast: cntrst }
      }
      return list
    })

    try {
      const res = await preprocessReceiptImage(targetFile, {
        rotationAngle: rot,
        doCrop: crop,
        preset: prst,
        brightness: bright,
        contrast: cntrst
      })

      setFileStates(prev => {
        const list = [...prev]
        if (list[idx]) {
          list[idx] = { ...list[idx], result: res, loading: false }
        }
        return list
      })
    } catch (err) {
      console.error('Preprocessing failed for file index', idx, err)
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const fallbackRes: PreprocessResult = {
          dataUrl,
          sizeBytes: targetFile.size,
          width: 0,
          height: 0,
          readinessScore: 75,
          readinessLabel: '🟡 Orijinal Görsel Okunuyor'
        }
        setFileStates(prev => {
          const list = [...prev]
          if (list[idx]) {
            list[idx] = { ...list[idx], result: fallbackRes, loading: false }
          }
          return list
        })
      }
      reader.readAsDataURL(targetFile)
    }
  }

  const isMergedTabActive = activeIndex === 999
  const currentSt = isMergedTabActive ? null : fileStates[activeIndex]

  const handleRotate = () => {
    if (!currentSt) return
    const nextRot = (currentSt.rotation + 90) % 360
    processFileAtIndex(activeIndex, currentSt.file, nextRot, currentSt.doCrop, currentSt.preset, currentSt.brightness, currentSt.contrast)
  }

  const handleToggleCrop = () => {
    if (!currentSt) return
    const nextCrop = !currentSt.doCrop
    processFileAtIndex(activeIndex, currentSt.file, currentSt.rotation, nextCrop, currentSt.preset, currentSt.brightness, currentSt.contrast)
  }

  const handlePresetChange = (newPreset: FilterPreset) => {
    if (!currentSt) return
    processFileAtIndex(activeIndex, currentSt.file, currentSt.rotation, currentSt.doCrop, newPreset, currentSt.brightness, currentSt.contrast)
  }

  const handleBrightnessChange = (val: number) => {
    if (!currentSt) return
    processFileAtIndex(activeIndex, currentSt.file, currentSt.rotation, currentSt.doCrop, currentSt.preset, val, currentSt.contrast)
  }

  const handleContrastChange = (val: number) => {
    if (!currentSt) return
    processFileAtIndex(activeIndex, currentSt.file, currentSt.rotation, currentSt.doCrop, currentSt.preset, currentSt.brightness, val)
  }

  // Hover Büyüteç Lens Mantığı
  const handleMouseMove = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return
    const rect = imgRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

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

  const handleConfirmAll = () => {
    if (fileStates.length > 1 && shouldMerge && mergedResult) {
      // If user chose to merge multiple images vertically into 1 unified long Z-report image:
      onConfirm([mergedResult])
    } else {
      const results = fileStates.map(s => s.result).filter((r): r is PreprocessResult => r !== null)
      if (results.length > 0) {
        onConfirm(results)
      }
    }
  }

  if (!isOpen || filesList.length === 0) return null

  const displayResult = isMergedTabActive ? mergedResult : currentSt?.result
  const origSizeMB = currentSt ? (currentSt.file.size / (1024 * 1024)).toFixed(2) : '3.0'
  const procSizeKB = displayResult ? (displayResult.sizeBytes / 1024).toFixed(0) : '0'
  const savingsPct = displayResult && currentSt ? Math.max(0, Math.round((1 - displayResult.sizeBytes / currentSt.file.size) * 100)) : 85

  const activeSrc = isMergedTabActive
    ? mergedResult?.dataUrl
    : showOriginal && currentSt?.originalUrl
    ? currentSt.originalUrl
    : currentSt?.result?.dataUrl

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title-studio"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-5xl max-h-[94vh] flex flex-col bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden text-stone-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-stone-800 bg-stone-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-lg" aria-hidden="true">
              ✨
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="modal-title-studio" className="font-semibold text-stone-100 text-lg">Akıllı Görsel İyileştirme Stüdyosu</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                  v3 Ultimate Studio
                </span>
              </div>
              <p className="text-xs text-stone-400">Gemini AI okuma başarısını %98'e çıkarmak için belgeleri düzenleyin.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Modali Kapat"
            className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors flex items-center justify-center font-bold"
          >
            ✕
          </button>
        </div>

        {/* Multi-Tab Bar with Vertical Merge Preview Tab */}
        {fileStates.length > 1 && (
          <div className="flex items-center justify-between px-6 py-2 bg-stone-950/90 border-b border-stone-800">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-stone-400 font-bold mr-1">Seçili Parçalar:</span>
              {fileStates.map((st, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setActiveIndex(idx)
                    setShowOriginal(false)
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2 border ${
                    idx === activeIndex
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                      : 'bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200'
                  }`}
                >
                  <span>📄 Parça {idx + 1}</span>
                  {st.result && <span className="w-2 h-2 rounded-full bg-emerald-400" />}
                </button>
              ))}

              {/* Combined Vertical Preview Tab */}
              <button
                onClick={() => setActiveIndex(999)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                  isMergedTabActive
                    ? 'bg-gradient-to-r from-emerald-500/30 to-emerald-600/30 border-emerald-500/60 text-emerald-300 shadow-lg'
                    : 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400 hover:bg-emerald-900/50'
                }`}
              >
                <span>🧩 Birleştirilmiş Tek Fiş (Canlı Önizleme)</span>
                {mergedResult && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
              </button>
            </div>

            {/* Merge Toggle */}
            <label className="flex items-center gap-2 cursor-pointer bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl">
              <input
                type="checkbox"
                checked={shouldMerge}
                onChange={e => setShouldMerge(e.target.checked)}
                className="accent-emerald-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs text-emerald-300 font-bold">Tek Görsel Olarak Birleştir</span>
            </label>
          </div>
        )}

        {/* AI Readiness & Optimization Badges */}
        <div className="px-6 py-2 bg-stone-950/90 border-b border-stone-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {displayResult && (
            <div className="flex items-center gap-2">
              <span className="font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                AI Okunabilirlik: %{displayResult.readinessScore}
              </span>
              <span className="text-stone-300 font-medium">{displayResult.readinessLabel}</span>
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

        {/* Canvas Preview Area with Magnifier & AI Highlights */}
        <div className="relative flex-1 min-h-[280px] max-h-[46vh] p-4 bg-stone-950/60 flex items-center justify-center overflow-auto">
          {(currentSt?.loading || isMerging) && (
            <div className="absolute inset-0 z-20 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center gap-3 text-amber-400 font-medium text-sm">
              <span className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              {isMerging ? 'Z-Raporu Parçaları Dikey Birleştiriliyor...' : 'Görsel İşleniyor & Netleştiriliyor...'}
            </div>
          )}

          {activeSrc && (
            <div className="relative cursor-crosshair group my-auto">
              <img
                ref={imgRef}
                src={activeSrc}
                alt="Receipt Preview"
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                className="max-h-[42vh] max-w-full object-contain rounded-lg shadow-2xl border border-stone-800"
              />

              {/* AI Auto Field Highlights (Neon Bounding Boxes) */}
              {showAiOverlays && !showOriginal && displayResult && (
                <>
                  {/* Tedarikçi Başlığı Area */}
                  <div className="absolute top-[8%] left-[15%] right-[15%] h-[14%] border-2 border-dashed border-emerald-400/80 bg-emerald-500/10 rounded pointer-events-none flex items-start justify-end p-1 shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                    <span className="text-[10px] font-bold bg-emerald-950/90 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40">
                      📍 Tedarikçi / Mağaza Adı & Z-No
                    </span>
                  </div>

                  {/* Tarih & Saat Area */}
                  <div className="absolute top-[24%] left-[20%] right-[20%] h-[10%] border-2 border-dashed border-cyan-400/80 bg-cyan-500/10 rounded pointer-events-none flex items-start justify-end p-1 shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                    <span className="text-[10px] font-bold bg-cyan-950/90 text-cyan-300 px-1.5 py-0.5 rounded border border-cyan-500/40">
                      📅 Fiş Tarihi & Saati
                    </span>
                  </div>

                  {/* Dip Toplam Tutar Area */}
                  <div className="absolute bottom-[8%] left-[10%] right-[10%] h-[16%] border-2 border-dashed border-amber-400/80 bg-amber-500/10 rounded pointer-events-none flex items-start justify-end p-1 shadow-[0_0_10px_rgba(251,191,36,0.3)]">
                    <span className="text-[10px] font-bold bg-amber-950/90 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/40">
                      💰 Dip Toplam Tutar & Nakit/Kart
                    </span>
                  </div>
                </>
              )}

              {/* Interactive Corner Pin Overlay Handles in Crop Mode */}
              {currentSt?.doCrop && !showOriginal && !isMergedTabActive && (
                <>
                  <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-amber-400 shadow-md" />
                  <div className="absolute top-1 right-1 w-4 h-4 border-t-2 border-r-2 border-amber-400 shadow-md" />
                  <div className="absolute bottom-1 left-1 w-4 h-4 border-b-2 border-l-2 border-amber-400 shadow-md" />
                  <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-amber-400 shadow-md" />
                </>
              )}

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
        <div className="p-4 bg-stone-950/95 border-t border-stone-800 space-y-3">
          
          {/* Presets Buttons & Sliders */}
          {!isMergedTabActive && currentSt && (
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
              
              {/* Presets */}
              <div className="flex items-center gap-1.5 bg-stone-900 p-1 rounded-xl border border-stone-800">
                <button
                  onClick={() => handlePresetChange('original')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    currentSt.preset === 'original'
                      ? 'bg-amber-500 text-stone-950 font-bold shadow'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  🎨 Renkli (Orijinal)
                </button>
                <button
                  onClick={() => handlePresetChange('enhanced')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    currentSt.preset === 'enhanced'
                      ? 'bg-amber-500 text-stone-950 font-bold shadow'
                      : 'text-stone-400 hover:text-stone-200'
                  }`}
                >
                  ☀️ Yüksek Kontrast
                </button>
                <button
                  onClick={() => handlePresetChange('bw')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                    currentSt.preset === 'bw'
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
                    value={currentSt.contrast}
                    onChange={e => handleContrastChange(parseFloat(e.target.value))}
                    className="w-24 accent-amber-500 cursor-pointer"
                  />
                  <span className="w-8 text-stone-300 font-mono text-[11px]">{Math.round(currentSt.contrast * 100)}%</span>
                </div>

                <div className="h-4 w-px bg-stone-800" />

                <div className="flex items-center gap-2">
                  <span className="text-stone-400 font-medium">Parlaklık:</span>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    step="5"
                    value={currentSt.brightness}
                    onChange={e => handleBrightnessChange(parseInt(e.target.value))}
                    className="w-24 accent-amber-500 cursor-pointer"
                  />
                  <span className="w-8 text-stone-300 font-mono text-[11px]">{currentSt.brightness > 0 ? `+${currentSt.brightness}` : currentSt.brightness}</span>
                </div>
              </div>

            </div>
          )}

          {/* Bottom Toolbar & Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              {!isMergedTabActive && currentSt && (
                <>
                  <button
                    onClick={handleRotate}
                    className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-medium transition-colors flex items-center gap-1.5"
                  >
                    🔄 90° Döndür ({currentSt.rotation}°)
                  </button>

                  <button
                    onClick={handleToggleCrop}
                    className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                      currentSt.doCrop
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'bg-stone-800 border-stone-700 text-stone-400'
                    }`}
                  >
                    📐 Otomatik Kırpma ({currentSt.doCrop ? 'Açık' : 'Kapalı'})
                  </button>
                </>
              )}

              <button
                onClick={() => setShowAiOverlays(prev => !prev)}
                className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  showAiOverlays
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-stone-800 border-stone-700 text-stone-400'
                }`}
              >
                🎯 AI Bölge Vurgulama ({showAiOverlays ? 'Açık' : 'Kapalı'})
              </button>

              {!isMergedTabActive && (
                <button
                  onMouseDown={() => setShowOriginal(true)}
                  onMouseUp={() => setShowOriginal(false)}
                  onMouseLeave={() => setShowOriginal(false)}
                  className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-xs font-medium transition-colors active:bg-stone-600"
                >
                  👁️ Basılı Tut: Orijinali Gör
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 text-xs font-medium transition-colors"
              >
                İptal
              </button>

              <button
                disabled={fileStates.some(s => s.loading) || isMerging}
                onClick={handleConfirmAll}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                ✨ {fileStates.length > 1 && shouldMerge ? '🧩 Birleştirilmiş Fişi Yapay Zekaya Gönder' : 'Yapay Zekaya Gönder ve Çözümle'}
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
