import { DocumentPreviewModal as SharedDocumentPreviewModal } from '@/components/DocumentPreviewModal'

type DocumentPreviewModalProps = {
    isOpen: boolean
    onClose: () => void
    url: string
}

export function DocumentPreviewModal({ isOpen, onClose, url }: DocumentPreviewModalProps) {
    return (
        <SharedDocumentPreviewModal 
            isOpen={isOpen}
            onClose={onClose}
            url={url}
            title="Yatırım Belgesi Önizleme"
        />
    )
}
