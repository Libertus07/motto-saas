'use client'

import { useState, useEffect } from 'react'

type DocumentPreviewModalProps = {
    isOpen: boolean
    onClose: () => void
    url: string | null
    title?: string
}

export function DocumentPreviewModal({ isOpen, onClose, url, title = 'Belge Önizleme' }: DocumentPreviewModalProps) {
    const [zoom, setZoom] = useState(1)

    // Reset view state when modal opens or URL changes
    useEffect(() => {
        setZoom(1)
    }, [url, isOpen])

    // Handle escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown)
            document.body.style.overflow = 'hidden'
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            document.body.style.overflow = 'unset'
        }
    }, [isOpen, onClose])

    if (!isOpen || !url) return null

    const isPdf = url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf')
    const isImage = !isPdf && (url.startsWith('data:image') || /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(url))

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3))
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.6))
    const handleResetView = () => setZoom(1)

    const handleDownload = () => {
        const link = document.createElement('a')
        link.href = url
        link.download = isPdf ? 'belge.pdf' : 'belge.png'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleOpenNewTab = () => {
        if (url.startsWith('data:')) {
            try {
                const arr = url.split(',')
                const mimeMatch = arr[0].match(/:(.*?);/)
                const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
                const bstr = atob(arr[1])
                let n = bstr.length
                const u8arr = new Uint8Array(n)
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n)
                }
                const blob = new Blob([u8arr], { type: mime })
                const blobUrl = URL.createObjectURL(blob)
                window.open(blobUrl, '_blank')
            } catch {
                const win = window.open()
                if (win) win.document.write(`<iframe src="${url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`)
            }
        } else {
            window.open(url, '_blank')
        }
    }

    return (
        <div 
            className="fixed inset-0 bg-stone-950/95 backdrop-blur-xl flex flex-col justify-between z-[9999] overflow-hidden select-none animate-fadeIn"
            onClick={onClose}
        >
            {/* ÜST DOCK (Floating Header Bar) */}
            <header 
                className="w-full px-4 py-3 bg-stone-900/90 backdrop-blur-md border-b border-stone-800/80 flex items-center justify-between z-20 shadow-lg shrink-0"
                onClick={e => e.stopPropagation()}
            >
                {/* Sol Taraf: Belge Bilgisi ve Rozet */}
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 text-lg shrink-0">
                        {isPdf ? '📄' : isImage ? '🖼️' : '📎'}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-stone-100 font-bold text-sm sm:text-base truncate max-w-[170px] sm:max-w-md">
                                {title}
                            </h3>
                            <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-stone-800 text-amber-400 border border-stone-700 shrink-0">
                                {isPdf ? 'PDF' : isImage ? 'GÖRSEL' : 'BELGE'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Sağ Taraf: Hızlı Kapat Butonu */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onClose}
                        className="bg-stone-800/90 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30 text-stone-300 text-sm font-bold px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl border border-stone-700/80 transition-all flex items-center gap-1.5 active:scale-95 shadow-sm"
                        title="Kapat (ESC)"
                    >
                        <span>✕</span>
                        <span className="hidden sm:inline">Kapat</span>
                    </button>
                </div>
            </header>

            {/* ORTA DOKÜMAN VİEWPORT ALANI (Sabit Çerçeve) */}
            <main 
                className="flex-1 w-full h-full relative overflow-auto flex items-center justify-center p-2 sm:p-6"
                onClick={e => e.stopPropagation()}
            >
                {/* Mobil için İpucu Notu */}
                <div className="sm:hidden absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-stone-900/95 backdrop-blur-md border border-stone-800 text-stone-300 text-[11px] px-3.5 py-1.5 rounded-full shadow-xl flex items-center gap-1.5 pointer-events-none whitespace-nowrap">
                    <span className="text-amber-400">💡</span>
                    <span>Rahat yakınlaştırmak için <strong>Sekmede Aç</strong>'ı kullanın</span>
                </div>

                {isPdf ? (
                    <div 
                        className="w-full max-w-5xl h-full rounded-2xl overflow-hidden shadow-2xl border border-stone-800/80 bg-stone-900 transition-transform duration-200 ease-out origin-center"
                        style={{
                            transform: `scale(${zoom})`
                        }}
                    >
                        <iframe 
                            src={url} 
                            className="w-full h-full rounded-2xl border-0 bg-white"
                            title="PDF Önizleme"
                        />
                    </div>
                ) : isImage ? (
                    <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
                        <img 
                            src={url} 
                            alt="Belge Önizleme" 
                            className="max-w-full max-h-[78vh] object-contain rounded-2xl shadow-2xl border border-stone-800/60 transition-transform duration-200 ease-out origin-center"
                            style={{
                                transform: `scale(${zoom})`
                            }}
                            draggable={false}
                        />
                    </div>
                ) : (
                    <div className="p-8 text-center bg-stone-900/90 border border-stone-800 rounded-3xl max-w-md shadow-2xl backdrop-blur-md">
                        <div className="text-5xl mb-4 animate-bounce">📄</div>
                        <h4 className="text-xl font-bold text-stone-100 mb-2">Desteklenmeyen Önizleme Formatı</h4>
                        <p className="text-stone-400 text-sm mb-6 leading-relaxed">
                            Bu dosya türü ekranda doğrudan işlenemiyor. Dosyayı görüntülemek veya kaydetmek için lütfen aşağıdaki seçenekleri kullanın.
                        </p>
                        <div className="flex justify-center gap-3">
                            <button 
                                onClick={handleOpenNewTab} 
                                className="bg-amber-500 hover:bg-amber-400 text-stone-950 px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition-all"
                            >
                                ↗️ Sekmede Aç
                            </button>
                            <button 
                                onClick={handleDownload} 
                                className="bg-stone-800 hover:bg-stone-700 text-stone-200 px-5 py-2.5 rounded-xl font-bold text-sm border border-stone-700 active:scale-95 transition-all"
                            >
                                📥 Cihaza İndir
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* ALT YÜZEN DOCK KONTROL BAR (Floating Action Dock) */}
            <footer 
                className="w-full pb-4 pt-2 px-4 flex justify-center z-20 pointer-events-none shrink-0"
                onClick={e => e.stopPropagation()}
            >
                <div className="pointer-events-auto bg-stone-900/95 backdrop-blur-xl border border-stone-800 px-3.5 py-2 rounded-2xl shadow-2xl flex items-center gap-2 sm:gap-3 max-w-full overflow-x-auto">
                    
                    {/* Görsel / Belge Zoom Kontrol Kümesi */}
                    <div className="flex items-center bg-stone-950/90 border border-stone-800 rounded-xl p-1 text-xs">
                        <button
                            onClick={handleZoomOut}
                            className="w-8 h-8 flex items-center justify-center text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors font-bold text-base active:scale-95"
                            title="Uzaklaştır (-)"
                        >
                            -
                        </button>
                        <button
                            onClick={handleResetView}
                            className="px-2.5 py-1 text-amber-400 hover:bg-stone-800 rounded-lg transition-colors font-bold text-xs min-w-[48px] text-center"
                            title="Görünümü Sıfırla (%100)"
                        >
                            %{Math.round(zoom * 100)}
                        </button>
                        <button
                            onClick={handleZoomIn}
                            className="w-8 h-8 flex items-center justify-center text-stone-300 hover:text-white hover:bg-stone-800 rounded-lg transition-colors font-bold text-base active:scale-95"
                            title="Yakınlaştır (+)"
                        >
                            +
                        </button>
                    </div>

                    <div className="w-px h-6 bg-stone-800 shrink-0" />

                    {/* Sekmede Aç (Yeni Sekmede Aç) */}
                    <button
                        onClick={handleOpenNewTab}
                        className="h-9 px-3.5 bg-stone-800/90 hover:bg-stone-700 text-stone-200 rounded-xl border border-stone-700 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
                        title="Yeni Sekmede / Tam Ekran Aç"
                    >
                        <span className="text-sm">↗️</span>
                        <span>Sekmede Aç</span>
                    </button>

                    {/* İndir Butonu */}
                    <button
                        onClick={handleDownload}
                        className="h-9 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
                        title="Belgeyi Cihaza İndir"
                    >
                        <span className="text-sm">📥</span>
                        <span>İndir</span>
                    </button>
                </div>
            </footer>
        </div>
    )
}
