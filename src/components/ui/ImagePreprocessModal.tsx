'use client'

import React, { useState, useEffect } from 'react'
import { preprocessReceiptImage, PreprocessResult } from '@/lib/imagePreprocess'

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
  const [doEnhance, setDoEnhance] = useState(true)
  const [showOriginal, setShowOriginal] = useState(false)
  
  const [originalUrl, setOriginalUrl] = useState<string | null>(null)
  const [processedResult, setProcessedResult] = useState<PreprocessResult | null>(null)

  // Orijinal görsel URL'ini ve varsayılan işlenmiş halini yükle
  useEffect(() => {
    if (!file || !isOpen) return

    const origUrl = URL.createObjectURL(file)
    setOriginalUrl(origUrl)
    setRotation(0)
    setDoCrop(true)
    setDoEnhance(true)
    setShowOriginal(false)

    processImage(file, 0, true, true)

    return () => {
      URL.revokeObjectURL(origUrl)
    }
  }, [file, isOpen])

  const processImage = async (
    targetFile: File,
    rot: number,
    crop: boolean,
    enhance: boolean
  ) => {
    setLoading(true)
    try {
      const res = await preprocessReceiptImage(targetFile, {
        rotationAngle: rot,
        doCrop: crop,
        doEnhance: enhance
      })
      setProcessedResult(res)
    } catch (err) {
      console.error('Preprocessing failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRotate = () => {
    const nextRot = (rotation + 90) % 360
    setRotation(nextRot)
    if (file) processImage(file, nextRot, doCrop, doEnhance)
  }

  const handleToggleCrop = () => {
    const nextCrop = !doCrop
    setDoCrop(nextCrop)
    if (file) processImage(file, rotation, nextCrop, doEnhance)
  }

  const handleToggleEnhance = () => {
    const nextEnhance = !doEnhance
    setDoEnhance(nextEnhance)
    if (file) processImage(file, rotation, doCrop, nextEnhance)
  }

  if (!isOpen || !file) return null

  const origSizeMB = (file.size / (1024 * 1024)).toFixed(2)
  const procSizeKB = processedResult
    ? (processedResult.sizeBytes / 1024).toFixed(0)
    : '0'
  const savingsPct = processedResult
    ? Math.max(0, Math.round((1 - processedResult.sizeBytes / file.size) * 100))
    : 0

  const isVercelApproved = processedResult
    ? processedResult.sizeBytes <= 3 * 1024 * 1024
    : true

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-stone-900 border border-stone-800 rounded-2xl shadow-2xl overflow-hidden text-stone-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800 bg-stone-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              ✨
            </div>
            <div>
              <h3 className="font-semibold text-stone-100 text-lg">Görsel İyileştirme & Netleştirme Stüdyosu</h3>
              <p className="text-xs text-stone-400">Yapay Zeka (Gemini OCR) okuma kalitesini artırmak için görseli kontrol edin.</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Live Size & Savings Badge */}
        <div className="px-6 py-2.5 bg-stone-950/80 border-b border-stone-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-stone-400">Orijinal: <strong className="text-stone-200">{origSizeMB} MB</strong></span>
            <span className="text-stone-600">➔</span>
            <span className="text-amber-400">Optimize: <strong className="text-emerald-400">{procSizeKB} KB</strong></span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-medium">
              %{savingsPct} Tasarruf
            </span>
          </div>

          {isVercelApproved ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Vercel 3MB Limit Uyumlu 🟢
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950 border border-amber-800 text-amber-300 font-medium">
              ⚠️ Görsel 3MB limitine yakın, kırpmayı deneyin.
            </span>
          )}
        </div>

        {/* Canvas Preview Area */}
        <div className="relative flex-1 min-h-[340px] max-h-[55vh] p-4 bg-stone-950/40 flex items-center justify-center overflow-auto">
          {loading && (
            <div className="absolute inset-0 z-10 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center gap-3 text-amber-400 font-medium text-sm">
              <span className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              Görsel İşleniyor & Netleştiriliyor...
            </div>
          )}

          {showOriginal && originalUrl ? (
            <img
              src={originalUrl}
              alt="Original"
              className="max-h-[50vh] max-w-full object-contain rounded-lg shadow-lg border border-stone-800"
            />
          ) : processedResult ? (
            <img
              src={processedResult.dataUrl}
              alt="Processed Preview"
              className="max-h-[50vh] max-w-full object-contain rounded-lg shadow-lg border border-stone-800 transition-all duration-200"
            />
          ) : null}
        </div>

        {/* Toolbar & Controls */}
        <div className="p-4 bg-stone-950/80 border-t border-stone-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
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
              onClick={handleToggleEnhance}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                doEnhance
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-stone-800 border-stone-700 text-stone-400'
              }`}
            >
              ☀️ Yazı Netleştirme ({doEnhance ? 'Açık' : 'Kapalı'})
            </button>

            <button
              onMouseDown={() => setShowOriginal(true)}
              onMouseUp={() => setShowOriginal(false)}
              onMouseLeave={() => setShowOriginal(false)}
              className="px-3 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-300 text-xs font-medium transition-colors flex items-center gap-1.5 active:bg-stone-600"
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
  )
}
