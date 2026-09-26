/**
 * The composer's attach buttons.
 *
 * Registered into `conversation.input.right`, which renders immediately left of
 * the model seat. A successful upload is turned into a draft chip; the
 * instruction text is produced later, by the reference codec at send time.
 */
import { useCallback, useRef, useState } from 'react'
import type { AttachmentStore } from '../attachment-store.js'
import type { AttachmentRecord } from '../attachments.js'
import { mintChip } from '../reference.js'
import { optimizeImageIfNeeded, pickFilesFromBrowser, uploadMultipleFiles } from '../uploader.js'

/** The `InputZone` owner share this slot delivers (point-in-time snapshots). */
export interface AttachButtonsProps {
  sessionId: string
  input: { draft: string; draftRev: number }
  store: AttachmentStore
  sessions: Parameters<typeof mintChip>[0]
  notify: (level: 'info' | 'error', text: string) => void
}

export function AttachButtons({ sessionId, input, store, sessions, notify }: AttachButtonsProps) {
  const [busy, setBusy] = useState(false)
  // The slot hands over a point-in-time snapshot and the skeleton re-renders
  // after each mint. This ref is how the loop below reads the LIVE draft and
  // draftRev instead of the values captured when the click started — draftRev is
  // a CAS token, so a stale one makes the insert a silent no-op.
  const live = useRef(input)
  live.current = input

  const attach = useCallback(async (isPhoto: boolean) => {
    const accept = isPhoto ? 'image/png,image/jpeg,image/webp,image/gif' : '*/*'
    const files = await pickFilesFromBrowser(accept, true)
    if (files.length === 0) return
    setBusy(true)
    try {
      const responses = await uploadMultipleFiles(sessionId, files, isPhoto)
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i]
        if (!response.ok || response.relativePath === undefined) continue
        const token = store.nextToken(sessionId, response.filename ?? files[i].name)
        const record: AttachmentRecord = {
          token,
          ref: store.refFor(sessionId, token),
          relativePath: response.relativePath,
          isPhoto,
          size: files[i].size,
          uploadedAt: Date.now(),
        }
        store.add(sessionId, record)
        if (!mintChip(sessions, sessionId, live.current, record)) {
          notify('error', `Không chèn được tham chiếu cho ${token}`)
        }
      }
    } catch (err) {
      notify('error', `Lỗi tải tệp: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }, [sessionId, store, sessions, notify])

  return (
    <>
      <button
        type="button"
        title="Thêm ảnh"
        aria-label="Thêm ảnh"
        disabled={busy}
        onClick={() => { void attach(true) }}
      >
        📷
      </button>
      <button
        type="button"
        title="Thêm tệp"
        aria-label="Thêm tệp"
        disabled={busy}
        onClick={() => { void attach(false) }}
      >
        📄
      </button>
    </>
  )
}
