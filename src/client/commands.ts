import type { Context } from '@deepseek-ai/cordis'
import {
  addDraftAttachments,
  clearDraftAttachments,
  getSessionUploads,
  openImageLightbox,
  renderAttachmentBar,
  type SessionUploadRecord,
} from './attachment-bar.js'
import {
  checkModelVision,
  fetchUploadedFiles,
  fileToBase64,
  formatFileSize,
  generateDraftPrompt,
  insertPromptIntoComposer,
  pickFilesFromBrowser,
  uploadMultipleFiles,
} from './uploader.js'

function bindComposerAutoClear(): void {
  const textarea = document.querySelector('textarea[data-input-target], textarea')
  if (textarea && !(textarea as any).__dsh_vision_bound) {
    (textarea as any).__dsh_vision_bound = true
    textarea.addEventListener('keydown', (e: any) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        setTimeout(clearDraftAttachments, 300)
      }
    })
    const sendBtn = document.querySelector('button[aria-label*="Send message"], button[aria-label*="Send"]')
    sendBtn?.addEventListener('click', () => {
      setTimeout(clearDraftAttachments, 300)
    })
  }
}

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
            // Build visual attachment records with data URLs for instant preview
            const records: SessionUploadRecord[] = []
            for (let i = 0; i < successful.length; i++) {
              const res = successful[i]
              const file = files[i]
              let previewUrl = ''
              try {
                const b64 = await fileToBase64(file)
                previewUrl = `data:${file.type || 'image/png'};base64,${b64}`
              } catch {
                previewUrl = URL.createObjectURL(file)
              }

              records.push({
                id: `${Date.now()}-${i}-${res.filename}`,
                name: res.filename ?? file.name,
                relativePath: res.relativePath ?? `uploads/${file.name}`,
                size: file.size,
                isPhoto: true,
                previewUrl,
                uploadedAt: Date.now(),
              })
            }

            addDraftAttachments(session.sessionId, records)
            bindComposerAutoClear()

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
            const records: SessionUploadRecord[] = successful.map((res, i) => {
              const file = files[i]
              return {
                id: `${Date.now()}-${i}-${res.filename}`,
                name: res.filename ?? file.name,
                relativePath: res.relativePath ?? `uploads/${file.name}`,
                size: file.size,
                isPhoto: false,
                uploadedAt: Date.now(),
              }
            })

            addDraftAttachments(session.sessionId, records)
            bindComposerAutoClear()

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
        // Read from local session storage first
        const localList = getSessionUploads(session.sessionId)

        // Try querying backend list
        const apiRes = await fetchUploadedFiles(session.sessionId)
        const apiFiles = apiRes.ok ? apiRes.files : []

        // Merge sources, preferring items with previews
        const map = new Map<string, SessionUploadRecord>()
        for (const f of apiFiles) {
          map.set(f.relativePath, {
            id: f.relativePath,
            name: f.name,
            relativePath: f.relativePath,
            size: f.size,
            isPhoto: f.isPhoto,
            previewUrl: f.viewUrl,
            uploadedAt: f.mtime,
          })
        }
        for (const l of localList) {
          map.set(l.relativePath, l)
        }

        const combined = Array.from(map.values()).sort((a, b) => b.uploadedAt - a.uploadedAt)

        if (combined.length === 0) {
          return [
            {
              id: 'empty',
              label: '📂 Chưa có file hoặc ảnh nào trong thư mục uploads/',
              detail: 'Dùng /photos hoặc /files để tải tệp lên workspace',
            },
          ]
        }

        return combined.map(item => ({
          id: item.relativePath,
          label: `${item.isPhoto ? '🖼️' : '📄'} ${item.name}`,
          detail: `${formatFileSize(item.size)} · ${item.relativePath}`,
          raw: item,
        }))
      },
      onSelect: async (option: any, _session: any) => {
        if (option.id === 'empty') return

        const item = option.raw as SessionUploadRecord
        if (item?.isPhoto && item?.previewUrl) {
          openImageLightbox(item.previewUrl, item.name)
        }

        const prompt = item?.isPhoto
          ? `Bạn hãy gọi tool \`read_image\` để xem và phân tích lại ảnh \`${item.relativePath}\`: `
          : `Bạn hãy đọc nội dung file \`${item.relativePath}\` (dùng tool \`read\`) và hỗ trợ tôi: `
        insertPromptIntoComposer(prompt)
      },
    },
  })
}
