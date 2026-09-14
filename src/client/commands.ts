import type { Context } from '@deepseek-ai/cordis'
import {
  checkModelVision,
  generateFileDraftPrompt,
  insertPromptIntoComposer,
  pickFileFromBrowser,
  uploadFileToWorkspace,
} from './uploader.js'

export function registerVisionCommands(ctx: Context): void {
  const commandUi = ctx.get('commandUi') as any
  if (!commandUi || typeof commandUi.register !== 'function') {
    return
  }

  // 1. Add photos command
  commandUi.register({
    name: 'photos',
    description: 'Add photos (Upload ảnh vào workspace và gọi tool read_image)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async (session: any) => {
        const vision = await checkModelVision(session.sessionId)
        if (!vision.hasVision) {
          return [
            {
              id: 'unsupported',
              label: `❌ Model ${vision.model ?? ''} chưa bật tính năng xem ảnh`,
              detail: vision.reason ?? 'Cần thêm input: [text, image] trong cấu hình model',
            },
          ]
        }
        return [
          {
            id: 'pick-photo',
            label: `📷 Chọn ảnh từ máy tính (${vision.model ?? 'Vision'})`,
            detail: 'Hỗ trợ .png, .jpg, .jpeg, .webp, .gif -> lưu vào uploads/',
          },
        ]
      },
      onSelect: async (option: any, session: any) => {
        if (option.id === 'unsupported') {
          return
        }

        const file = await pickFileFromBrowser('image/png,image/jpeg,image/webp,image/gif')
        if (!file) return

        try {
          const uploadRes = await uploadFileToWorkspace(session.sessionId, file, true)
          if (uploadRes.ok && uploadRes.relativePath) {
            const prompt = generateFileDraftPrompt(uploadRes.relativePath, true)
            insertPromptIntoComposer(prompt)
          } else {
            alert(`Lỗi lưu ảnh: ${uploadRes.error ?? 'Unknown error'}`)
          }
        } catch (err: any) {
          alert(`Lỗi upload ảnh: ${err?.message ?? err}`)
        }
      },
    },
  })

  // 2. Add files command
  commandUi.register({
    name: 'files',
    description: 'Add files (Tải file/tài liệu vào workspace để model đọc qua tool read)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async () => [
        {
          id: 'pick-file',
          label: '📄 Chọn file từ máy tính để tải lên workspace',
          detail: 'Hỗ trợ mọi định dạng tệp (.txt, .pdf, .json, .csv, code...) -> lưu vào uploads/',
        },
      ],
      onSelect: async (_option: any, session: any) => {
        const file = await pickFileFromBrowser('*/*')
        if (!file) return

        try {
          const uploadRes = await uploadFileToWorkspace(session.sessionId, file, false)
          if (uploadRes.ok && uploadRes.relativePath) {
            const prompt = generateFileDraftPrompt(uploadRes.relativePath, false)
            insertPromptIntoComposer(prompt)
          } else {
            alert(`Lỗi lưu file: ${uploadRes.error ?? 'Unknown error'}`)
          }
        } catch (err: any) {
          alert(`Lỗi upload file: ${err?.message ?? err}`)
        }
      },
    },
  })
}
