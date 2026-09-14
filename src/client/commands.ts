import type { Context } from '@deepseek-ai/cordis'
import { addAttachments, openImageLightbox } from './attachment-bar.js'
import {
  checkModelVision,
  fetchUploadedFiles,
  formatFileSize,
  generateDraftPrompt,
  insertPromptIntoComposer,
  pickFilesFromBrowser,
  uploadMultipleFiles,
} from './uploader.js'

export function registerVisionCommands(ctx: Context): void {
  const commandUi = ctx.get('commandUi') as any
  if (!commandUi || typeof commandUi.register !== 'function') {
    return
  }

  // 1. Add photos command (supports multiple photos)
  commandUi.register({
    name: 'photos',
    description: 'Add photos (Upload một hoặc nhiều ảnh vào workspace và gọi tool read_image)',
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
            label: `📷 Chọn một hoặc nhiều ảnh (${vision.model ?? 'Vision'})`,
            detail: 'Hỗ trợ chọn nhiều ảnh cùng lúc (.png, .jpg, .webp, .gif) -> uploads/',
          },
        ]
      },
      onSelect: async (option: any, session: any) => {
        if (option.id === 'unsupported') {
          return
        }

        const files = await pickFilesFromBrowser('image/png,image/jpeg,image/webp,image/gif', true)
        if (files.length === 0) return

        try {
          const uploadResponses = await uploadMultipleFiles(session.sessionId, files, true)
          const successful = uploadResponses.filter(r => r.ok && r.relativePath)

          if (successful.length > 0) {
            // Add to visual attachment rail
            const items = successful.map((res, index) => {
              const file = files[index]
              const previewUrl = URL.createObjectURL(file)
              return {
                id: `${Date.now()}-${index}-${res.filename}`,
                name: res.filename ?? file.name,
                relativePath: res.relativePath ?? `uploads/${file.name}`,
                size: file.size,
                isPhoto: true,
                previewUrl,
              }
            })
            addAttachments(session.sessionId, items)

            // Insert prompt into chat composer
            const prompt = generateDraftPrompt(
              successful.map(r => ({ relativePath: r.relativePath!, isPhoto: true }))
            )
            insertPromptIntoComposer(prompt)
          } else {
            alert('Upload ảnh thất bại')
          }
        } catch (err: any) {
          alert(`Lỗi upload ảnh: ${err?.message ?? err}`)
        }
      },
    },
  })

  // 2. Add files command (supports multiple files)
  commandUi.register({
    name: 'files',
    description: 'Add files (Tải một hoặc nhiều file/tài liệu vào workspace để model đọc)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async () => [
        {
          id: 'pick-file',
          label: '📄 Chọn một hoặc nhiều file từ máy tính',
          detail: 'Hỗ trợ chọn nhiều tệp (.txt, .pdf, .json, .csv, code, zip...) -> uploads/',
        },
      ],
      onSelect: async (_option: any, session: any) => {
        const files = await pickFilesFromBrowser('*/*', true)
        if (files.length === 0) return

        try {
          const uploadResponses = await uploadMultipleFiles(session.sessionId, files, false)
          const successful = uploadResponses.filter(r => r.ok && r.relativePath)

          if (successful.length > 0) {
            // Add to visual attachment rail
            const items = successful.map((res, index) => {
              const file = files[index]
              return {
                id: `${Date.now()}-${index}-${res.filename}`,
                name: res.filename ?? file.name,
                relativePath: res.relativePath ?? `uploads/${file.name}`,
                size: file.size,
                isPhoto: false,
                previewUrl: '',
              }
            })
            addAttachments(session.sessionId, items)

            // Insert prompt into chat composer
            const prompt = generateDraftPrompt(
              successful.map(r => ({ relativePath: r.relativePath!, isPhoto: false }))
            )
            insertPromptIntoComposer(prompt)
          } else {
            alert('Upload file thất bại')
          }
        } catch (err: any) {
          alert(`Lỗi upload file: ${err?.message ?? err}`)
        }
      },
    },
  })

  // 3. Uploads list command (View all uploaded files in this session)
  commandUi.register({
    name: 'uploads',
    description: 'Uploaded files (Xem danh sách các file/ảnh đã tải lên trong workspace)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async (session: any) => {
        const res = await fetchUploadedFiles(session.sessionId)
        if (!res.ok || res.files.length === 0) {
          return [
            {
              id: 'empty',
              label: '📂 Chưa có file hoặc ảnh nào trong thư mục uploads/',
              detail: 'Dùng /photos hoặc /files để tải tệp lên workspace',
            },
          ]
        }

        return res.files.map(file => ({
          id: file.relativePath,
          label: `${file.isPhoto ? '🖼️' : '📄'} ${file.name}`,
          detail: `${formatFileSize(file.size)} · ${file.relativePath}`,
          raw: file,
        }))
      },
      onSelect: async (option: any, _session: any) => {
        if (option.id === 'empty') return

        const file = option.raw
        if (file?.isPhoto && file?.viewUrl) {
          // Open preview lightbox for photos
          openImageLightbox(file.viewUrl, file.name)
        }

        // Insert prompt to ask model to read this file
        const prompt = file?.isPhoto
          ? `Bạn hãy gọi tool \`read_image\` để xem và phân tích lại ảnh \`${option.id}\`: `
          : `Bạn hãy đọc nội dung file \`${option.id}\` (dùng tool \`read\`) và hỗ trợ tôi: `
        insertPromptIntoComposer(prompt)
      },
    },
  })
}
