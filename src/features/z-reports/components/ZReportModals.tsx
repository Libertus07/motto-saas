import dynamic from 'next/dynamic'
import type { ZReportWorkspace } from '../hooks/useZReportWorkspace'
import { ZReportProductModal } from './ZReportProductModal'

const ImagePreprocessModal = dynamic(
  () => import('@/components/ui/ImagePreprocessModal').then((module) => module.ImagePreprocessModal),
  { ssr: false },
)

export function ZReportModals({ workspace }: { workspace: ZReportWorkspace }) {
  return (
    <>
      <ZReportProductModal workspace={workspace} />
      <ImagePreprocessModal
        isOpen={workspace.isPreprocessOpen}
        files={workspace.preprocessFiles}
        onClose={workspace.closePreprocess}
        onConfirm={workspace.confirmPreprocess}
      />
    </>
  )
}
