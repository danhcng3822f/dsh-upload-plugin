import type { Context } from '@deepseek-ai/cordis'
import {
  attachmentStore,
  attachmentViewUrl,
  openImageLightbox,
} from './attachment-bar.js'
import type { AttachmentRecord } from './attachments.js'
import {
  intakePhotos,
  PHOTO_ACCEPT,
  type DraftAdmission,
  type NativeDraftImages,
} from './intake.js'
import { mintChip, nextChipCursor } from './reference.js'
import {
  checkModelVision,
  cleanDisplayName,
  fetchUploadedFiles,
  formatFileSize,
  pickFilesFromBrowser,
  uploadMultipleFiles,
} from './uploader.js'

/** One `/uploads` row: what to show, plus the record a chip can point at. */
interface UploadOption {
  relativePath: string
  name: string
  size: number
  isPhoto: boolean
  previewUrl?: string
  uploadedAt: number
  /** The stored record for this file, when this plugin has one. */
  record?: AttachmentRecord
}

/**
 * The session's input facade, or undefined when the session is not scoped right
 * now — the same condition `mintChip` refuses on.
 */
function sessionInput(ctx: Context, sessionId: string): any {
  const sessions = ctx.get('sessions') as any
  const actx = sessions?.scope?.(sessionId)
  if (actx === undefined) return undefined
  return (ctx.get('conversation') as any)?.input?.for?.(actx)
}

/**
 * Surface one notice on the session's composer, the way the attach buttons do.
 *
 * The level rides through verbatim: a refusal or a capability warning is `info`,
 * a failure to act at all is `error` — the same split the harness's own composer
 * uses (`InputBar.tsx:676-678` only colours `error` differently).
 */
function notifySession(
  ctx: Context,
  sessionId: string,
  level: 'info' | 'error',
  text: string
): void {
  const facade = sessionInput(ctx, sessionId)
  if (typeof facade?.notify === 'function') {
    facade.notify(level, text)
    return
  }
  console.warn(`[dsh-upload-plugin] ${level}: ${text}`)
}

/**
 * The session's live draft admission, or undefined when this plugin cannot write
 * to it at all: the session is not scoped right now, or the facade carries no
 * admission verb — the same conditions `mintChip` refuses on.
 *
 * `SessionInput` (`ui-conversation/src/client/input/contract.ts:33-59`) is where
 * both halves come from: `addImages` (`:37`) is the admission, `state` (`:58`) is
 * the published draft whose `imageIds` the pre-check reads as its `current`. The
 * facade is resolved exactly as `notifySession` resolves it, so the two notice and
 * admission channels can never point at different sessions.
 */
function draftAdmission(ctx: Context, sessionId: string): DraftAdmission | undefined {
  const facade = sessionInput(ctx, sessionId)
  if (typeof facade?.addImages !== 'function') return undefined
  const state = facade.state?.getSnapshot?.()
  if (state === undefined || state === null) return undefined
  return {
    imageIds: state.imageIds,
    addImages: ids => facade.addImages(ids),
  }
}

/**
 * The attach path: upload, record, chip — the same sequence the composer buttons
 * run, against the same store and the same live draft. The chip is the only thing
 * that carries the attachment; nothing is written into the composer text.
 */
async function attachFiles(
  ctx: Context,
  sessionId: string,
  files: File[],
  isPhoto: boolean
): Promise<void> {
  const store = attachmentStore()
  if (store === undefined) {
    notifySession(ctx, sessionId, 'error', 'Kho tệp đính kèm chưa sẵn sàng')
    return
  }

  const sessions = ctx.get('sessions') as any
  // Pre-flight only: it keeps an unusable session from uploading anything.
  const ready = sessionInput(ctx, sessionId)?.state?.getSnapshot?.()
  if (ready === undefined || ready === null) {
    notifySession(ctx, sessionId, 'error', 'Phiên hiện tại chưa sẵn sàng để chèn tham chiếu')
    return
  }

  const responses = await uploadMultipleFiles(sessionId, files, isPhoto)

  // Re-read after the upload: `draftRev` is a CAS token, and any keystroke during
  // a multi-second upload invalidates the pre-upload read — seeding the cursor
  // from it would fail every mint and lose an attachment that did upload. The loop
  // below is synchronous, so this read is the only freshness the CAS needs.
  const live = sessionInput(ctx, sessionId)?.state?.getSnapshot?.()
  if (live === undefined || live === null) {
    notifySession(ctx, sessionId, 'error', 'Phiên hiện tại chưa sẵn sàng để chèn tham chiếu')
    return
  }

  // Advance the cursor only after a mint really landed: a refused mint leaves the
  // draft untouched, so the next iteration must reuse the same pair or its CAS is
  // stale too.
  let cursor = { draft: live.draft, draftRev: live.draftRev }

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i]
    const name = response.filename ?? files[i].name
    if (!response.ok || response.relativePath === undefined) {
      notifySession(ctx, sessionId, 'error', `Không tải được ${name}`)
      continue
    }

    const token = store.nextToken(sessionId, name)
    const record: AttachmentRecord = {
      token,
      ref: store.refFor(sessionId, token),
      relativePath: response.relativePath,
      isPhoto,
      size: files[i].size,
      uploadedAt: Date.now(),
    }
    store.add(sessionId, record)

    if (!mintChip(sessions, sessionId, cursor, record)) {
      notifySession(ctx, sessionId, 'error', `Không chèn được tham chiếu cho ${token}`)
      continue
    }
    cursor = nextChipCursor(cursor)
  }
}

export function registerVisionCommands(ctx: Context): void {
  const commandUi = ctx.get('commandUi') as any
  if (!commandUi || typeof commandUi.register !== 'function') {
    return
  }

  // 1. Add photos command (supports multiple photos).
  //
  // The same code path as the composer's 📷 button, deliberately: a photo is
  // admitted as a **native draft image**, so the model receives the image itself
  // and nothing is spliced into the text of the user's own message. The sequence
  // is `intakePhotos` (`./intake.js`), shared with the button, so the two entry
  // points cannot drift.
  commandUi.register({
    name: 'photos',
    description: 'Add photos (Thêm một hoặc nhiều ảnh vào bản nháp để model xem trực tiếp)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async () => [
        {
          id: 'pick-photo',
          label: '📷 Chọn một hoặc nhiều ảnh',
          detail: 'Hỗ trợ chọn nhiều ảnh cùng lúc (.png, .jpg, .webp, .gif)',
        },
      ],
      onSelect: async (_option: any, session: any) => {
        const sessionId = session.sessionId
        // Started before the picker resolves: the dialog is slower than this
        // request by orders of magnitude, so the capability warning costs the user
        // no extra wait. The 📷 button orders the two the same way.
        const vision = checkModelVision(sessionId)
        const files = await pickFilesFromBrowser(PHOTO_ACCEPT, true)
        if (files.length === 0) return

        intakePhotos({
          files,
          faces: {
            // The service the button is handed as a prop, reached the way this
            // file already reaches `sessions` and `conversation.input`.
            conversation: ctx.get('conversation') as NativeDraftImages | undefined,
            draft: draftAdmission(ctx, sessionId),
          },
          // No limits are passed on purpose. `imageLimits` arrives through
          // `useProjection`, a hook that exists only inside a slot component
          // (`web-react/src/session-provider.tsx:96-114`), and a command is not one.
          // Absent limits are capability absence, not a zero limit: the admission
          // then defers to the host's submit-time enforcement, which is the
          // posture the composer documents for callers that bypass it
          // (`InputBar.tsx:437-439`).
          limits: undefined,
          vision,
          notify: (level, text) => { notifySession(ctx, sessionId, level, text) },
        })
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
          await attachFiles(ctx, session.sessionId, files, false)
        } catch (err: any) {
          notifySession(ctx, session.sessionId, 'error', `Lỗi upload file: ${err?.message ?? err}`)
        }
      },
    },
  })

  // 3. Uploads list command (history for this session, and the explicit way to
  //    re-reference an earlier upload: picking one mints a new chip)
  commandUi.register({
    name: 'uploads',
    description: 'Uploaded files (Xem danh sách các file/ảnh đã tải lên trong session này)',
    available: () => true,
    ui: {
      kind: 'popupSelect',
      options: async (session: any) => {
        const store = attachmentStore()
        const records = store?.list(session.sessionId) ?? []
        const recordByPath = new Map(records.map(r => [r.relativePath, r]))

        // The disk list is what /uploads is for; the records are what a chip can
        // point at. Merged so both a file this plugin uploaded and one that
        // predates it are listed.
        const apiRes = await fetchUploadedFiles(session.sessionId)
        const apiFiles = apiRes.ok ? apiRes.files : []

        const byPath = new Map<string, UploadOption>()
        for (const f of apiFiles) {
          byPath.set(f.relativePath, {
            relativePath: f.relativePath,
            name: cleanDisplayName(f.name),
            size: f.size,
            isPhoto: f.isPhoto,
            previewUrl: f.viewUrl,
            uploadedAt: f.mtime,
            record: recordByPath.get(f.relativePath),
          })
        }
        for (const r of records) {
          if (byPath.has(r.relativePath)) continue
          byPath.set(r.relativePath, {
            relativePath: r.relativePath,
            name: r.token,
            size: r.size,
            isPhoto: r.isPhoto,
            previewUrl: attachmentViewUrl(session.sessionId, r.relativePath),
            uploadedAt: r.uploadedAt,
            record: r,
          })
        }

        const combined = [...byPath.values()].sort((a, b) => b.uploadedAt - a.uploadedAt)

        if (combined.length === 0) {
          return [
            {
              id: 'empty',
              label: '📂 Chưa có file hoặc ảnh nào được tải lên trong session này',
              detail: 'Dùng /files để tải tệp vào session này',
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
      onSelect: async (option: any, session: any) => {
        if (option.id === 'empty') return

        const item = option.raw as UploadOption
        if (item?.isPhoto && item?.previewUrl) {
          openImageLightbox(item.previewUrl, item.name)
        }

        const store = attachmentStore()
        if (store === undefined) {
          notifySession(ctx, session.sessionId, 'error', 'Kho tệp đính kèm chưa sẵn sàng')
          return
        }
        const state = sessionInput(ctx, session.sessionId)?.state?.getSnapshot?.()
        if (state === undefined || state === null) {
          notifySession(ctx, session.sessionId, 'error', 'Phiên hiện tại chưa sẵn sàng để chèn tham chiếu')
          return
        }

        // Re-referencing is history, not a queue: it mints a NEW chip for this
        // message, which is what makes the instruction appear for it. A file with
        // no record yet (uploaded before this version, or in another tab) gets one
        // here — a chip that resolves to nothing would block the send.
        const token = item.record?.token ?? store.nextToken(session.sessionId, item.name)
        const record: AttachmentRecord = item.record ?? {
          token,
          ref: store.refFor(session.sessionId, token),
          relativePath: item.relativePath,
          isPhoto: item.isPhoto,
          size: item.size,
          uploadedAt: Date.now(),
        }
        if (item.record === undefined) store.add(session.sessionId, record)

        if (!mintChip(ctx.get('sessions') as any, session.sessionId, state, record)) {
          notifySession(ctx, session.sessionId, 'error', `Không chèn được tham chiếu cho ${token}`)
        }
      },
    },
  })
}
