import type { Context } from '@deepseek-ai/cordis'
import {
  checkModelVision,
  generateFileDraftPrompt,
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
    description: 'Add photos (Upload ảnh vào workspace và yêu cầu model xem qua read_image)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async (session: any) => {
        // Run vision check first
        const vision = await checkModelVision(session.sessionId)
        if (!vision.hasVision) {
          return [
            {
              id: 'unsupported',
              label: '❌ Model hiện tại không hỗ trợ Vision (ảnh)',
              detail: vision.reason ?? 'Vui lòng chọn model có modality image',
            },
          ]
        }
        return [
          {
            id: 'pick-photo',
            label: '📷 Chọn ảnh từ máy tính để tải lên workspace',
            detail: 'Hỗ trợ .png, .jpg, .jpeg, .webp, .gif',
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
          detail: 'Hỗ trợ mọi định dạng tệp (.txt, .pdf, .json, .csv, code...)',
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
          }
        } catch (err: any) {
          alert(`Lỗi upload file: ${err?.message ?? err}`)
        }
      },
    },
  })
}

function insertPromptIntoComposer(prompt: string): void {
  const textarea = document.querySelector('textarea[data-input-target], textarea') as HTMLTextAreaElement | null
  if (textarea) {
    const current = textarea.value
    textarea.value = current ? `${current}\n${prompt}` : prompt
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.focus()
  }
}
