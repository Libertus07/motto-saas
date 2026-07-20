type NotePreviewModalProps = {
    isOpen: boolean
    onClose: () => void
    text: string
}

export function NotePreviewModal({ isOpen, onClose, text }: NotePreviewModalProps) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-md shadow-2xl flex flex-col">
                <div className="flex justify-between items-center p-6 border-b border-stone-800">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><span>📝</span> Yatırım Notları</h3>
                    <button onClick={onClose} className="text-stone-500 hover:text-white text-xl">✕</button>
                </div>
                <div className="p-6 overflow-auto max-h-[60vh]">
                    <p className="text-stone-300 leading-relaxed whitespace-pre-wrap">{text}</p>
                </div>
                <div className="p-6 border-t border-stone-800 flex justify-end">
                    <button onClick={onClose} className="bg-stone-800 hover:bg-stone-700 text-white px-6 py-2 rounded-xl font-bold transition-colors">Kapat</button>
                </div>
            </div>
        </div>
    )
}
