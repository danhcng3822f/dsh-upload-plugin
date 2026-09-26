import { describe, it, expect, vi } from 'vitest'
import type { ComposerAttachment, DraftAttachmentId } from '@deepseek-ai/dsh-client-ui-conversation'
import {
  checkImageIntake,
  intakePhotos,
  intakeRefusalText,
  PHOTO_ACCEPT,
  type DraftAdmission,
  type ImageLimits,
  type NativeDraftImages,
} from '../src/client/intake.js'
import type { VisionCheckResponse } from '../src/types.js'

const LIMITS: ImageLimits = {
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  maxImagesPerMessage: 3,
  maxImageBytes: 100,
  maxMessageImageBytes: 200,
}

/**
 * A file as every check reads it: only the declared type and the byte count. The
 * cast is the whole of what the sequence needs — it hands the object straight to
 * `createDraftImages` without touching it.
 */
const file = (type: string, size: number): File => ({ type, size }) as unknown as File
const png = (size = 10) => file('image/png', size)

describe('checkImageIntake', () => {
  it('admits a batch inside every limit', () => {
    expect(checkImageIntake([png(), png()], [png()], LIMITS)).toBeNull()
  })

  it('admits an empty batch without consulting the limits', () => {
    expect(checkImageIntake([], [png(), png(), png(), png()], LIMITS)).toBeNull()
  })

  it('admits everything while no limits are projected, deferring to the host', () => {
    expect(checkImageIntake([file('application/pdf', 1_000_000)], [png()], undefined)).toBeNull()
  })

  it('refuses a file the deployment does not list', () => {
    expect(checkImageIntake([png(), file('image/bmp', 10)], [], LIMITS))
      .toEqual({ reason: 'unsupportedType' })
  })

  it('checks format before any limit, so a non-image never reports a count or size', () => {
    // Four files break the count limit and the total, and one of them is a
    // non-image: the format problem is the one the user can act on.
    const batch = [png(90), png(90), file('text/plain', 90), png(90)]
    expect(checkImageIntake(batch, [], LIMITS)).toEqual({ reason: 'unsupportedType' })
  })

  it('counts the draft images the message already carries', () => {
    const batch = [png(), png()]
    expect(checkImageIntake(batch, [], LIMITS)).toBeNull()
    expect(checkImageIntake(batch, [png()], LIMITS)).toBeNull()
    expect(checkImageIntake(batch, [png(), png()], LIMITS))
      .toEqual({ reason: 'tooMany', limit: 3 })
  })

  it('refuses a batch whose own file exceeds the per-image limit', () => {
    expect(checkImageIntake([png(101)], [], LIMITS)).toEqual({ reason: 'fileTooLarge', limit: 100 })
  })

  it('does not apply the per-image limit to images already in the draft', () => {
    // The composer checks the picked batch alone against maxImageBytes; only the
    // total is a projection over the whole message.
    expect(checkImageIntake([png(10)], [png(150)], LIMITS)).toBeNull()
  })

  it('sums the draft bytes and the batch bytes for the message limit', () => {
    // 120 + 90 = 210 over the 200-byte total, while the batch file is inside the
    // 100-byte per-image limit — so only the summed check can refuse it.
    expect(checkImageIntake([png(90)], [png(120)], LIMITS))
      .toEqual({ reason: 'totalTooLarge', limit: 200 })
  })

  it('treats each limit as inclusive at its exact value', () => {
    // Exactly at the count, exactly at the per-image size, exactly at the total.
    expect(checkImageIntake([png(100)], [png(100)], LIMITS)).toBeNull()
  })

  it('prefers the count limit over a size problem in the same batch', () => {
    expect(checkImageIntake([png(101), png(101), png(101), png(101)], [], LIMITS))
      .toEqual({ reason: 'tooMany', limit: 3 })
  })

  it('prefers the per-image limit over the total it also breaks', () => {
    expect(checkImageIntake([png(150), png(150)], [], LIMITS))
      .toEqual({ reason: 'fileTooLarge', limit: 100 })
  })
})

describe('intakeRefusalText', () => {
  it('names the supported formats without echoing the rejected type', () => {
    expect(intakeRefusalText({ reason: 'unsupportedType' })).toBe('Chỉ hỗ trợ ảnh PNG, JPG, WebP, GIF')
  })

  it('names the count limit it broke', () => {
    expect(intakeRefusalText({ reason: 'tooMany', limit: 20 })).toContain('20')
  })

  it('renders the byte limits through the plugin formatter', () => {
    expect(intakeRefusalText({ reason: 'fileTooLarge', limit: 5 * 1024 * 1024 })).toContain('5.0 MB')
    expect(intakeRefusalText({ reason: 'totalTooLarge', limit: 100 * 1024 * 1024 })).toContain('100.0 MB')
  })

  it('distinguishes the per-image limit from the message total', () => {
    expect(intakeRefusalText({ reason: 'fileTooLarge', limit: 1024 }))
      .not.toBe(intakeRefusalText({ reason: 'totalTooLarge', limit: 1024 }))
  })
})

describe('PHOTO_ACCEPT', () => {
  it('offers exactly the media types the deployment publishes', () => {
    // The picker's filter and the pre-check's first rule read the same four types,
    // so the dialog cannot offer a file the intake would then refuse.
    expect(PHOTO_ACCEPT.split(',')).toEqual(LIMITS.mediaTypes)
  })
})

// ---------------------------------------------------------------------------
// The admit sequence. Everything below drives `intakePhotos` through fakes: the
// same function the 📷 button and the `/photos` command call, so these cases pin
// both entry points at once.
// ---------------------------------------------------------------------------

/** One registered draft image, as `createDraftImages` returns it. */
const draftImage = (id: string, source: File): ComposerAttachment => ({
  kind: 'image',
  id: id as DraftAttachmentId,
  file: source,
  previewUrl: `blob:${id}`,
})

const draftId = (value: string) => value as DraftAttachmentId

/** A stand-in conversation service that records every call the sequence makes. */
function conversationFake(options: {
  /** The draft's live descriptors `draftImages` resolves to. */
  draft?: readonly ComposerAttachment[]
  /** What `createDraftImages` throws instead of registering anything. */
  throws?: Error
} = {}) {
  const calls = {
    draftImages: [] as (readonly DraftAttachmentId[])[],
    createDraftImages: [] as (readonly File[])[],
    releaseDraftImages: [] as (readonly ComposerAttachment[])[],
  }
  const service: NativeDraftImages = {
    draftImages: (ids) => { calls.draftImages.push(ids); return options.draft ?? [] },
    createDraftImages: (files) => {
      calls.createDraftImages.push(files)
      if (options.throws !== undefined) throw options.throws
      return files.map((source, index) => draftImage(`draft-${index}`, source))
    },
    releaseDraftImages: (attachments) => { calls.releaseDraftImages.push(attachments) },
  }
  return { service, calls }
}

/** A stand-in draft admission that records what it was asked to append. */
function draftFake(options: { imageIds?: readonly DraftAttachmentId[]; admits?: boolean } = {}) {
  const appended: (readonly DraftAttachmentId[])[] = []
  const draft: DraftAdmission = {
    imageIds: options.imageIds ?? [],
    addImages: (ids) => { appended.push(ids); return options.admits ?? true },
  }
  return { draft, appended }
}

/** A notice channel that keeps what it was told, and in what order. */
function noticeChannel() {
  const seen: { level: string; text: string }[] = []
  const notify = (level: 'info' | 'error', text: string): void => { seen.push({ level, text }) }
  return { seen, notify }
}

/** A capability check, resolved as `checkModelVision` answers it. */
const vision = (check: Partial<VisionCheckResponse> = {}): Promise<VisionCheckResponse> =>
  Promise.resolve({ hasVision: true, ...check })

/** Let the capability check's own `then` run: it is a microtask, not a tick. */
const settled = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve() }

describe('intakePhotos', () => {
  it('registers the batch and admits exactly the ids it minted, in order', () => {
    const { service, calls } = conversationFake()
    const { draft, appended } = draftFake()
    const notices = noticeChannel()

    intakePhotos({
      files: [png(), png()],
      faces: { conversation: service, draft },
      limits: LIMITS,
      vision: vision(),
      notify: notices.notify,
    })

    expect(calls.createDraftImages).toHaveLength(1)
    expect(appended).toEqual([[draftId('draft-0'), draftId('draft-1')]])
    expect(calls.releaseDraftImages).toEqual([])
    expect(notices.seen).toEqual([])
  })

  it('checks the batch against the draft as the click found it, not against the pick alone', () => {
    // Two images already in the draft plus two picked break the three-image limit:
    // only a projection over the whole message can refuse this.
    const live = [draftImage('live-1', png()), draftImage('live-2', png())]
    const { service, calls } = conversationFake({ draft: live })
    const { draft, appended } = draftFake({ imageIds: [draftId('live-1'), draftId('live-2')] })
    const notices = noticeChannel()

    intakePhotos({
      files: [png(), png()],
      faces: { conversation: service, draft },
      limits: LIMITS,
      vision: vision(),
      notify: notices.notify,
    })

    expect(calls.draftImages).toEqual([[draftId('live-1'), draftId('live-2')]])
    expect(notices.seen).toEqual([
      { level: 'info', text: intakeRefusalText({ reason: 'tooMany', limit: 3 }) },
    ])
    // Refused as a whole, before anything was registered.
    expect(calls.createDraftImages).toEqual([])
    expect(appended).toEqual([])
  })

  it('admits with no limits at all, deferring to the host', () => {
    // The `/photos` command has no projection seat and passes none: a batch that
    // would break every limit still goes through, and the host enforces at submit.
    const { service, calls } = conversationFake()
    const { draft, appended } = draftFake()
    const notices = noticeChannel()

    intakePhotos({
      files: [file('image/bmp', 10_000_000)],
      faces: { conversation: service, draft },
      limits: undefined,
      vision: vision(),
      notify: notices.notify,
    })

    expect(calls.createDraftImages).toHaveLength(1)
    expect(appended).toHaveLength(1)
    expect(notices.seen).toEqual([])
  })

  it('turns the service\'s own MIME refusal into the format refusal', () => {
    const thrown = new Error('unsupported image media type: image/bmp')
    thrown.name = 'UnsupportedImageMediaTypeError'
    const { service } = conversationFake({ throws: thrown })
    const { draft, appended } = draftFake()
    const notices = noticeChannel()

    intakePhotos({
      files: [file('image/bmp', 10)],
      faces: { conversation: service, draft },
      limits: undefined,
      vision: vision(),
      notify: notices.notify,
    })

    expect(notices.seen).toEqual([
      { level: 'info', text: intakeRefusalText({ reason: 'unsupportedType' }) },
    ])
    expect(appended).toEqual([])
  })

  it('reports any other registration failure verbatim', () => {
    const { service } = conversationFake({ throws: new Error('out of memory') })
    const { draft } = draftFake()
    const notices = noticeChannel()

    intakePhotos({
      files: [png()],
      faces: { conversation: service, draft },
      limits: LIMITS,
      vision: vision(),
      notify: notices.notify,
    })

    expect(notices.seen).toEqual([{ level: 'info', text: 'Không thêm được ảnh: out of memory' }])
  })

  it('releases the batch when the admission transaction refuses it', () => {
    const { service, calls } = conversationFake()
    const { draft, appended } = draftFake({ admits: false })
    const notices = noticeChannel()

    intakePhotos({
      files: [png()],
      faces: { conversation: service, draft },
      limits: LIMITS,
      vision: vision(),
      notify: notices.notify,
    })

    expect(appended).toHaveLength(1)
    // The descriptors were registered and then refused: they are released again,
    // exactly as the composer's own intake wrapper releases them.
    expect(calls.releaseDraftImages.map(released => released.map(image => image.id)))
      .toEqual([[draftId('draft-0')]])
    expect(notices.seen).toEqual([
      { level: 'info', text: 'Chưa thêm được ảnh: hãy thử lại sau khi tin nhắn hiện tại gửi xong' },
    ])
  })

  it('announces the missing conversation service instead of admitting', () => {
    const { draft, appended } = draftFake()
    const notices = noticeChannel()

    intakePhotos({
      files: [png()],
      faces: { conversation: undefined, draft },
      limits: LIMITS,
      vision: vision(),
      notify: notices.notify,
    })

    expect(notices.seen).toEqual([
      { level: 'error', text: 'Dịch vụ hội thoại chưa sẵn sàng để thêm ảnh' },
    ])
    expect(appended).toEqual([])
  })

  it('announces an unavailable session instead of admitting', () => {
    const { service, calls } = conversationFake()
    const notices = noticeChannel()

    intakePhotos({
      files: [png()],
      faces: { conversation: service, draft: undefined },
      limits: LIMITS,
      vision: vision(),
      notify: notices.notify,
    })

    expect(notices.seen).toEqual([
      { level: 'error', text: 'Phiên hiện tại chưa sẵn sàng để thêm ảnh' },
    ])
    expect(calls.createDraftImages).toEqual([])
  })

  it('admits first and warns after, when the model cannot see images', async () => {
    const order: string[] = []
    const { service } = conversationFake()
    const draft: DraftAdmission = {
      imageIds: [],
      addImages: () => { order.push('admit'); return true },
    }
    const seen: { level: string; text: string }[] = []
    const notify = (level: 'info' | 'error', text: string): void => {
      order.push('notify')
      seen.push({ level, text })
    }

    intakePhotos({
      files: [png()],
      faces: { conversation: service, draft },
      limits: LIMITS,
      vision: vision({ hasVision: false, model: 'text-only', reason: 'thiếu input: [text, image]' }),
      notify,
    })

    // The admission is synchronous and never waits on the check; the warning is a
    // microtask behind it, so the user's photo is never held back by the network.
    expect(order).toEqual(['admit'])
    await settled()
    expect(order).toEqual(['admit', 'notify'])
    expect(seen).toEqual([
      { level: 'info', text: '⚠️ Model text-only chưa bật tính năng xem ảnh — thiếu input: [text, image]' },
    ])
  })

  it('says nothing when the model can see images', async () => {
    const { service } = conversationFake()
    const { draft } = draftFake()
    const notices = noticeChannel()

    intakePhotos({
      files: [png()],
      faces: { conversation: service, draft },
      limits: LIMITS,
      vision: vision({ hasVision: true, model: 'vision-model' }),
      notify: notices.notify,
    })

    await settled()
    expect(notices.seen).toEqual([])
  })

  it('warns nothing when the batch never landed', async () => {
    const { service } = conversationFake()
    const { draft } = draftFake({ admits: false })
    const notices = noticeChannel()

    intakePhotos({
      files: [png()],
      faces: { conversation: service, draft },
      limits: LIMITS,
      vision: vision({ hasVision: false, model: 'text-only' }),
      notify: notices.notify,
    })

    await settled()
    // One notice only, and it is the refusal: a batch that never landed raises no
    // capability warning.
    expect(notices.seen).toEqual([
      { level: 'info', text: 'Chưa thêm được ảnh: hãy thử lại sau khi tin nhắn hiện tại gửi xong' },
    ])
  })

  it('swallows a capability-check rejection into the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { service } = conversationFake()
      const { draft, appended } = draftFake()
      const notices = noticeChannel()

      intakePhotos({
        files: [png()],
        faces: { conversation: service, draft },
        limits: LIMITS,
        vision: Promise.reject(new Error('offline')),
        notify: notices.notify,
      })

      await settled()
      expect(appended).toHaveLength(1)
      expect(notices.seen).toEqual([])
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})
