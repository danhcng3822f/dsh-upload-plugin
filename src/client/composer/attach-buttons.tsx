/**
 * The composer's attach buttons.
 *
 * Registered into `conversation.input.right`, which renders immediately left of
 * the model seat. The two buttons take two different routes, deliberately:
 *
 * - **📷 photo** admits the picked files as the harness's own **native draft
 *   images**. The composer renders them, the composer's rail removes them, and at
 *   submit they become real image content blocks
 *   (`ui-conversation/src/client/service.ts:142-157`), so the model receives the
 *   image itself rather than an instruction telling it to go read a file. The
 *   admission sequence itself is `../intake.js`'s `intakePhotos`, shared with the
 *   `/photos` command so the two entry points cannot drift.
 * - **📄 file** keeps the plugin's own path: upload into the workspace, record,
 *   chip. A non-image cannot be a draft image, so the instruction still has to
 *   reach the model another way — that is task R25-B2.
 */
import { useCallback, useRef, useState } from 'react'
import { Button, IconPaperclipOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation'
import type { AttachmentStore } from '../attachment-store.js'
import type { AttachmentRecord } from '../attachments.js'
import { intakePhotos, PHOTO_ACCEPT, type ImageLimits, type NativeDraftImages } from '../intake.js'
import { mintChip, nextChipCursor } from '../reference.js'
import { checkModelVision, pickFilesFromBrowser, uploadMultipleFiles } from '../uploader.js'
import { IconCameraOutline16 } from './icons.js'

/**
 * Icon-only form for these two controls.
 *
 * `Button size="sm"` is a 28px-tall pill with `padding: 0 10px`, sized for a
 * label. The shell's own icon button is a 28x28 square (its stylesheet names
 * `Icon_container 28x28` as the icon-only form), so the box is squared here
 * while the variant keeps supplying the token fill and its hover state.
 */
const ICON_BUTTON = { width: 28, padding: 0 } as const

/**
 * The session standard kit's projection reader — the fifth framework hook seat
 * (`web-react/src/session-provider.tsx:96-114`), delivered to every session-scope
 * slot component (`scoped-slots.tsx:378`). Key-addressed, and `undefined` means
 * capability absent rather than a zero value. This plugin reads exactly one key:
 * `imageLimits`, the same source the composer's own pre-check reads
 * (`InputBar.tsx:91`).
 */
export interface ProjectionReader {
  (key: 'imageLimits'): ImageLimits | undefined
}

/**
 * The `InputZone` owner share this slot delivers (point-in-time snapshots), as
 * the harness publishes it: `input` is the live `InputState`, not a hand-stated
 * subset (`ui-conversation/src/client/contract/slots.ts:274-277`).
 */
export interface AttachButtonsProps {
  sessionId: string
  input: InputState
  store: AttachmentStore
  sessions: Parameters<typeof mintChip>[0]
  notify: (level: 'info' | 'error', text: string) => void
  /** The conversation service face (declared in `../intake.js`); undefined when the service is not composed. */
  conversation: NativeDraftImages | undefined
  /** The session standard kit's public input actions (the admission verb). */
  inputActions: InputActions
  /** The session standard kit's projection reader (the intake limits' source). */
  useProjection: ProjectionReader
}

export function AttachButtons({
  sessionId, input, store, sessions, notify, conversation, inputActions, useProjection,
}: AttachButtonsProps) {
  const [busy, setBusy] = useState(false)
  // The slot hands over a point-in-time snapshot; this ref is refreshed on every
  // render, so a click starts from the click-time draft and draftRev rather than
  // from the values captured when the component mounted. draftRev is a CAS token,
  // so a stale one makes the insert a silent no-op — `attachFile` carries the pair
  // forward from this starting point, because it cannot re-render mid-loop.
  const live = useRef(input)
  live.current = input

  // The deployment's image-intake limits, read from the composer's own source.
  // Absent while no attachment service is composed; the pre-check then defers
  // entirely to the host's submit-time enforcement, exactly as the composer's does.
  const imageLimits = useProjection('imageLimits')

  /**
   * The 📷 path: pick, then hand the batch to the shared native intake.
   *
   * Nothing here uploads, mints a chip or writes a record — the harness owns the
   * image from the moment `addImages` accepts it. The admission sequence itself
   * (pre-check, register, admit, release on a refused admission, vision warning)
   * is `../intake.js`'s `intakePhotos`, the same call the `/photos` command makes,
   * so the two entry points cannot drift.
   */
  const attachPhoto = useCallback(async () => {
    // Started before the picker resolves, so the vision warning costs the user no
    // extra wait: a file dialog is slower than this request by orders of magnitude.
    const vision = checkModelVision(sessionId)
    const files = await pickFilesFromBrowser(PHOTO_ACCEPT, true)
    if (files.length === 0) return

    intakePhotos({
      files,
      faces: {
        conversation,
        // The slot hands over a point-in-time snapshot; the `live` ref is
        // refreshed on every render, so the batch is checked against the draft as
        // it stands at the click rather than as it stood at mount.
        draft: {
          imageIds: live.current.imageIds,
          addImages: ids => inputActions.addImages(ids),
        },
      },
      // The composer's own projection — the same key and the same seat its
      // pre-check reads (`InputBar.tsx:91`), so there is no second source of truth.
      limits: imageLimits,
      vision,
      notify,
    })
  }, [sessionId, conversation, inputActions, imageLimits, notify])

  /** The 📄 path, unchanged: upload into the workspace, record, chip. */
  const attachFile = useCallback(async () => {
    const files = await pickFilesFromBrowser('*/*', true)
    if (files.length === 0) return
    setBusy(true)
    try {
      const responses = await uploadMultipleFiles(sessionId, files, false)
      // This loop runs synchronously, so React cannot re-render inside it and the
      // `live` ref still holds the revision the click started from. The cursor
      // models the machine's own transaction instead — `nextChipCursor` carries
      // the append and the revision bump, and is called only after a mint really
      // landed, because a refused mint leaves the draft untouched and the next
      // iteration must reuse the same pair.
      let cursor = { draft: live.current.draft, draftRev: live.current.draftRev }
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i]
        if (!response.ok || response.relativePath === undefined) continue
        const token = store.nextToken(sessionId, response.filename ?? files[i].name)
        const record: AttachmentRecord = {
          token,
          ref: store.refFor(sessionId, token),
          relativePath: response.relativePath,
          isPhoto: false,
          size: files[i].size,
          uploadedAt: Date.now(),
        }
        store.add(sessionId, record)
        if (!mintChip(sessions, sessionId, cursor, record)) {
          notify('error', `Không chèn được tham chiếu cho ${token}`)
          continue
        }
        cursor = nextChipCursor(cursor)
      }
    } catch (err) {
      notify('error', `Lỗi tải tệp: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }, [sessionId, store, sessions, notify])

  return (
    <>
      <Button
        variant="toolbar"
        size="sm"
        icon={<IconCameraOutline16 size={16} />}
        style={ICON_BUTTON}
        title="Thêm ảnh"
        aria-label="Thêm ảnh"
        disabled={busy}
        onClick={() => { void attachPhoto() }}
      />
      <Button
        variant="toolbar"
        size="sm"
        icon={<IconPaperclipOutline16 size={16} />}
        style={ICON_BUTTON}
        title="Thêm tệp"
        aria-label="Thêm tệp"
        disabled={busy}
        onClick={() => { void attachFile() }}
      />
    </>
  )
}
