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

    // Reset zoom when modal opens or URL changes
    useEffect(() => {
        setZoom(1)
    }, [url, isOpen])

    if (!isOpen || !url) return null

    const isPdf = url.startsWith('data:application/pdf') || url.toLowerCase().includes('.pdf')
    const isImage = !isPdf && (url.startsWith('data:image') || /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(url))

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3))
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5))
    const handleResetZoom = () => setZoom(1)

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
            // For data URLs in mobile browsers, blob URL works better
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
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[9999] p-2 sm:p-4"
            onClick={onClose}
        >
            <div 
                className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-5xl h-[92vh] sm:h-[88vh] shadow-2xl flex flex-col overflow-hidden relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Üst Bar (Header & Aksiyonlar) */}
                <div className="flex flex-wrap justify-between items-center px-4 py-3 bg-stone-950 border-b border-stone-800 gap-2">
                    <div className="flex items-center gap-2 text-stone-200 font-bold text-sm sm:text-base truncate">
                        <span>{isPdf ? '📄' : '🖼️'}</span>
                        <span className="truncate max-w-[150px] sm:max-w-xs">{title}</span>
                    </div>

                    {/* Kontrol Butonları */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        {/* Zoom Kontrolleri (Görsel ve Canvas İçin) */}
                        <div className="flex items-center bg-stone-900 border border-stone-800 rounded-xl p-1 text-xs">
                            <button
                                onClick={handleZoomOut}
                                title="Uzaklaştır"
                                className="px-2 py-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors font-bold"
                            >
                                -
                            </button>
                            <button
                                onClick={handleResetZoom}
                                title="Sıfırla"
                                className="px-2 py-1 text-amber-400 hover:bg-stone-800 rounded-lg transition-colors font-semibold min-w-[45px] text-center"
                            >
                                %{Math.round(zoom * 100)}
                            </button>
                            <button
                                onClick={handleZoomIn}
                                title="Yakınlaştır"
                                className="px-2 py-1 text-stone-400 hover:text-white hover:bg-stone-800 rounded-lg transition-colors font-bold"
                            >
                                +
                            </button>
                        </div>

                        {/* Yeni Sekmede Aç */}
                        <button
                            onClick={handleOpenNewTab}
                            title="Tam Ekran / Yeni Sekmede Aç"
                            className="bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-xl border border-stone-700 flex items-center gap-1.5 transition-colors"
                        >
                            <span>↗️</span>
                            <span className="hidden sm:inline">Yeni Sekmede Aç</span>
                        </button>

                        {/* İndir Butonu */}
                        <button
                            onClick={handleDownload}
                            title="Belgeyi İndir"
                            className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-xl border border-amber-500/30 flex items-center gap-1.5 transition-colors"
                        >
                            <span>📥</span>
                            <span className="hidden sm:inline">İndir</span>
                        </button>

                        {/* Kapat Butonu */}
                        <button
                            onClick={onClose}
                            className="bg-stone-800 hover:bg-red-500/20 hover:text-red-400 text-stone-400 p-1.5 sm:px-3 sm:py-1.5 rounded-xl border border-stone-700 transition-colors font-bold text-sm ml-1"
                        >
                            ✕ <span className="hidden sm:inline">Kapat</span>
                        </button>
                    </div>
                </div>

                {/* Mobil Bilgilendirme Notu */}
                <div className="sm:hidden bg-amber-500/10 border-b border-amber-500/20 px-3 py-1.5 text-[11px] text-amber-300 flex items-center justify-between gap-2">
                    <span>💡 Yakınlaştırıp indirmek için <strong>"Yeni Sekmede Aç"</strong> butonunu kullanabilirsiniz.</span>
                </div>

                {/* İçerik Alanı (Doküman veya Görsel) */}
                <div className="flex-1 bg-stone-950/80 overflow-auto p-2 sm:p-4 flex items-center justify-center relative touch-pan-x touch-pan-y">
                    {isPdf ? (
                        <div 
                            className="w-full h-full transition-transform duration-150 ease-out origin-center flex items-center justify-center"
                            style={{ transform: `scale(${zoom})` }}
                        >
                            <iframe 
                                src={url} 
                                className="w-full h-full rounded-xl border-0 bg-white shadow-xl"
                                title="Belge Önizleme"
                            />
                        </div>
                    ) : isImage ? (
                        <div className="overflow-auto max-w-full max-h-full flex items-center justify-center">
                            <img 
                                src={url} 
                                alt="Belge Önizleme" 
                                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-transform duration-150 ease-out origin-center"
                                style={{ transform: `scale(${zoom})` }}
                            />
                        </div>
                    ) : (
                        <div className="p-8 text-center bg-stone-900 border border-stone-800 rounded-2xl max-w-md">
                            <div className="text-4xl mb-3">📄</div>
                            <h4 className="text-lg font-bold text-stone-200 mb-2">Belge Ekranda Doğrudan Gösterilemiyor</h4>
                            <p className="text-stone-400 text-sm mb-4">Bu dosya formatını mobil/tarayıcı üzerinden görüntülemek veya indirmek için aşağıdaki butonları kullanabilirsiniz.</p>
                            <div className="flex justify-center gap-3">
                                <button onClick={handleOpenNewTab} className="bg-amber-500 text-stone-950 px-4 py-2 rounded-xl font-bold text-sm">
                                    Yeni Sekmede Aç
                                </button>
                                <button onClick={handleDownload} className="bg-stone-800 text-stone-200 px-4 py-2 rounded-xl font-bold text-sm border border-stone-700">
                                    İndir
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
