type DocumentPreviewModalProps = {
    isOpen: boolean
    onClose: () => void
    url: string
}

export function DocumentPreviewModal({ isOpen, onClose, url }: DocumentPreviewModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[60] p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b border-stone-800">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2"><span>📎</span> Belge Görüntüleyici</h3>
                    <button onClick={onClose} className="text-stone-500 hover:text-white text-2xl px-2">✕</button>
                </div>
                <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-stone-950/50">
                    {url.startsWith('data:application/pdf') ? (
                        <iframe src={url} className="w-full h-[70vh] rounded-lg bg-white" />
                    ) : (
                        <img src={url} alt="Belge" className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-lg" />
                    )}
                </div>
            </div>
        </div>
    )
}
