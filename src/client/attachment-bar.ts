import { useEffect } from 'react'
import type { InputActions, InputState } from '@deepseek-ai/dsh-client-ui-conversation'
import type { AttachmentStore } from './attachment-store.js'
import { VISION_SOURCE, type AttachmentRecord, type ChipOccurrence } from './attachments.js'
import { liveRecords, syncActiveRefs } from './ref-sync.js'
import { formatFileSize } from './uploader.js'

/** The placeholder one chip occupies in the draft; an occurrence covers exactly `[offset, offset + 1)`. */
const CHIP_PLACEHOLDER = '\uFFFC'

/**
 * One live-draft snapshot: the session on screen and the chips its draft holds
 * right now. This is the rail's only data source — a record list of its own
 * would keep showing attachments the sent message already consumed.
 */
export interface RailSnapshot {
  sessionId: string
  occurrences: readonly ChipOccurrence[]
}

/**
 * The record index chips resolve against: the one store the attach buttons
 * write, bound by the plugin entry.
 *
 * It must be that same instance. `AttachmentStore` caches a session's records
 * after its first `list`, so a second instance over the same localStorage would
 * overwrite the first one's writes and hide records the draft still points at.
 */
let store: AttachmentStore | undefined

/** Bind the record index (the plugin entry owns it; every other reader asks here). */
export function bindAttachmentStore(next: AttachmentStore): void {
  store = next
}

/** The bound record index, or undefined before the plugin entry binds it. */
export function attachmentStore(): AttachmentStore | undefined {
  return store
}

/**
 * Removes one chip from the draft. The rail builds plain DOM and holds no input
 * machine, so the composer entry binds the session-scope `inputActions.setDraft`
 * it receives as a slot prop.
 */
let removeChip: ((sessionId: string, ref: string) => void) | undefined

/** Bind the draft write the rail's remove button uses. */
export function bindChipRemover(remove: (sessionId: string, ref: string) => void): void {
  removeChip = remove
}

/**
 * The draft with one chip's placeholder deleted and every other character left
 * exactly as the user typed it.
 * @param draft - the live draft.
 * @param offset - the occurrence's placeholder offset.
 * @returns the next draft, or undefined when no placeholder sits at that offset —
 * a stale offset must never eat a character the user typed.
 */
export function draftWithoutChip(draft: string, offset: number): string | undefined {
  if (draft[offset] !== CHIP_PLACEHOLDER) return undefined
  return draft.slice(0, offset) + draft.slice(offset + 1)
}

/** Host-served URL for one uploaded file (the endpoint `/uploads` previews through too). */
export function attachmentViewUrl(sessionId: string, relativePath: string): string {
  const file = encodeURIComponent(relativePath)
  const session = encodeURIComponent(sessionId)
  return `/api/vision-plugin/view?file=${file}&sessionId=${session}`
}

/** The snapshot the rail last rendered from; the session watcher re-renders from it. */
let lastSnapshot: RailSnapshot | null = null
/** Signature of the cards on screen, so an unchanged render costs no DOM work. */
let lastRenderedSignature: string | null = null
let lastActiveSessionId: string | null = null

export function detectActiveSessionId(): string | null {
  const card = document.querySelector('[data-composer-card="true"]')
  if (!card) return lastActiveSessionId

  const key = Object.keys(card).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'))
  if (key) {
    let curr = (card as any)[key]
    while (curr) {
      if (curr.memoizedProps?.sessionId) return curr.memoizedProps.sessionId
      if (typeof curr.key === 'string' && curr.key.startsWith('session-')) return curr.key
      curr = curr.return
    }
  }

  return lastActiveSessionId
}

/**
 * Remove one attachment from the draft.
 *
 * The chip IS the attachment: the record only resolves a chip that is already in
 * the draft, so dropping the record alone would leave a chip whose serialization
 * fails and block the send. This deletes just that placeholder — typed text is
 * untouched — and the machine drops the occurrence with it, which is what takes
 * the card off the rail.
 * @param sessionId - the session whose draft holds the chip.
 * @param ref - the chip's reference id.
 */
export function removeDraftAttachment(sessionId: string, ref: string): void {
  removeChip?.(sessionId, ref)
}

/**
 * The live `InputZone` share slice the rail entry reads, plus the session
 * standard kit's input actions.
 *
 * Both halves are the harness's own contracts rather than hand-stated subsets:
 * the composer hands a `conversation.input.right` entry its `InputZone`
 * (`ui-conversation/src/client/contract/slots.ts:274-277`, built at
 * `ConversationRoot.tsx:81-82`) whose `input` is the published `InputState`, and
 * `inputActions` is the `InputActions` face that same kit provides to every
 * session-scope entry (`:229-234`). `offset` is part of `Occurrence`, so the
 * guard below is a boundary guard rather than a type-level branch.
 */
export interface RailEntryProps {
  sessionId: string
  input?: InputState
  inputActions?: InputActions
}

/**
 * The composer entry that drives the rail.
 *
 * The rail is plain DOM injected into the composer card, so something that React
 * re-renders has to push the live draft into it. This entry is that something: it
 * sits in the composer tool row, receives the session's `InputZone` share and the
 * public `inputActions`, and re-renders the rail whenever either changes — which
 * is why a sent message empties the rail with no bookkeeping of its own. It
 * renders nothing.
 *
 * The rail's remove button is armed here too: it needs the draft write, which only
 * a session-scope slot component is handed.
 */
export function AttachmentRailEntry({ sessionId, input, inputActions }: RailEntryProps) {
  // No dependency array on purpose: the share is a fresh snapshot per render, and
  // the remove button must be armed with THIS render's draft and offsets (typing
  // before a chip shifts them). What the signature guard inside
  // `renderAttachmentBar` skips is only the DOM REBUILD when the cards on screen
  // already match — the record resolution behind that signature still runs, and
  // it walks the store per chip.
  useEffect(() => {
    const draft = input?.draft ?? ''
    const occurrences = input?.occurrences ?? []
    bindChipRemover((targetSessionId, ref) => {
      if (targetSessionId !== sessionId) return
      const occurrence = occurrences.find(o => o.source === VISION_SOURCE && o.ref === ref)
      if (occurrence?.offset === undefined) return
      const next = draftWithoutChip(draft, occurrence.offset)
      if (next === undefined) return
      inputActions?.setDraft(next)
    })
    renderAttachmentBar({ sessionId, occurrences })
  })
  return null
}

/**
 * Injects CSS matching DeepSeek Harness native InputBar and AttachmentRail design tokens
 */
function ensureStylesInjected(): void {
  const styleId = 'dsh-upload-plugin-styles'
  if (document.getElementById(styleId)) return

  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    #dsh-vision-attachments-rail {
      min-width: 0;
      padding: 6px 12px 0;
      box-sizing: border-box;
      width: 100%;
    }

    .dsh-vision-rail {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      align-items: center;
      padding-bottom: 2px;
    }

    .dsh-vision-rail::-webkit-scrollbar {
      display: none;
    }

    .dsh-vision-item {
      position: relative;
      flex: 0 0 auto;
      height: 64px;
    }

    .dsh-vision-item-photo {
      flex: 0 0 64px;
      width: 64px;
    }

    .dsh-vision-thumb {
      width: 64px;
      height: 64px;
      overflow: hidden;
      border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(128, 128, 128, 0.2));
      border-radius: 16px;
      background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.08));
      cursor: zoom-in;
      box-sizing: border-box;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }

    .dsh-vision-thumb:hover {
      border-color: var(--dsw-alias-state-business-primary, #4176e6);
    }

    .dsh-vision-thumb img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 15px;
    }

    .dsh-vision-file-card {
      height: 64px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      box-sizing: border-box;
      border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(128, 128, 128, 0.2));
      border-radius: 16px;
      background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.08));
      min-width: 140px;
      max-width: 240px;
      cursor: default;
      user-select: none;
      transition: border-color 0.15s ease;
    }

    .dsh-vision-file-card:hover {
      border-color: var(--dsw-alias-state-business-primary, #4176e6);
    }

    .dsh-vision-file-badge {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: rgba(65, 118, 230, 0.12);
      color: var(--dsw-alias-state-business-primary, #4176e6);
      display: grid;
      place-items: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    .dsh-vision-file-meta {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      line-height: 1.3;
    }

    .dsh-vision-file-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--dsw-alias-label-primary, currentColor);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }

    .dsh-vision-file-size {
      font-size: 11px;
      color: var(--dsw-alias-label-secondary, #888);
    }

    .dsh-vision-remove {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 2;
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--dsw-alias-button-contrast-fill, #61666b);
      color: var(--dsw-alias-label-primary-inverted, #ffffff);
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.15s ease;
    }

    .dsh-vision-item:hover .dsh-vision-remove,
    .dsh-vision-remove:focus-visible {
      opacity: 1;
    }

    .dsh-vision-remove:hover {
      transform: scale(1.1);
    }

    @media (pointer: coarse) {
      .dsh-vision-remove {
        opacity: 1;
      }
    }
  `
  document.head.appendChild(style)
}

const CLOSE_ICON_SVG = `
  <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor">
    <path d="M7 5.586L11.95 0.636a1 1 0 1 1 1.414 1.414L8.414 7l4.95 4.95a1 1 0 0 1-1.414 1.414L7 8.414l-4.95 4.95a1 1 0 0 1-1.414-1.414L5.586 7 0.636 2.05A1 1 0 0 1 2.05 0.636L7 5.586z"/>
  </svg>
`

/**
 * DeepSeek Harness native-styled Image Lightbox
 */
export function openImageLightbox(imageUrl: string, title: string): void {
  const existing = document.getElementById('dsh-vision-lightbox')
  if (existing) existing.remove()

  const backdrop = document.createElement('div')
  backdrop.id = 'dsh-vision-lightbox'
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: grid;
    place-items: center;
    padding: 40px;
    box-sizing: border-box;
  `

  const mask = document.createElement('div')
  mask.style.cssText = `
    position: absolute;
    inset: 0;
    background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.75));
    backdrop-filter: var(--dsw-mask-blur, blur(12px));
    -webkit-backdrop-filter: var(--dsw-mask-blur, blur(12px));
    cursor: zoom-out;
  `
  backdrop.appendChild(mask)

  const img = document.createElement('img')
  img.src = imageUrl
  img.alt = title
  img.style.cssText = `
    position: relative;
    max-width: min(100%, 1600px);
    max-height: calc(100vh - 80px);
    object-fit: contain;
    border-radius: 12px;
    background: var(--dsw-specific-input-major, #1e1e1e);
    box-shadow: var(--dsw-shadow-lv3, 0 16px 48px rgba(0,0,0,0.5));
    cursor: default;
  `
  backdrop.appendChild(img)

  const closeBtn = document.createElement('button')
  closeBtn.title = 'Đóng (Esc)'
  closeBtn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(255, 255, 255, 0.15));
    border-radius: 999px;
    background: var(--dsw-specific-input-major, #1f232b);
    color: var(--dsw-alias-label-primary, #fff);
    cursor: pointer;
    font-size: 14px;
    transition: transform 0.15s ease, background 0.15s ease;
  `
  closeBtn.innerHTML = CLOSE_ICON_SVG
  backdrop.appendChild(closeBtn)

  const close = () => backdrop.remove()
  mask.onclick = close
  closeBtn.onclick = close

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close()
      document.removeEventListener('keydown', onKeyDown)
    }
  }
  document.addEventListener('keydown', onKeyDown)

  document.body.appendChild(backdrop)
}

/**
 * The records whose chip is in this draft right now — the rail's whole content.
 *
 * The derivation itself lives in `./ref-sync.js` (`liveRecords`), because R25-B2
 * pushes exactly this set to the host for the context injection. One function for
 * both readers: a card on the rail and a ref the model is told about cannot
 * disagree. This wrapper only supplies the bound store and refuses the empty
 * session, which is the rail's own guard.
 */
function activeRecords(snapshot: RailSnapshot): AttachmentRecord[] {
  if (store === undefined || snapshot.sessionId === '') return []
  return liveRecords(snapshot.occurrences, store.list(snapshot.sessionId), ref => store?.byRef(ref))
}

/**
 * Render the attachment rail for one live-draft snapshot, directly inside
 * `[data-composer-card="true"]`.
 *
 * The rail shows only what the draft currently references, so a sent message
 * empties it and a chip removed from the draft takes its card with it — no
 * plugin-side list, and therefore nothing to go stale between sends.
 *
 * R25-B2 hangs the host sync off this same entry point: it is called from the
 * rail entry's effect, which already runs on every composer render, so the push
 * follows the live draft with no second observation path. It sits BEFORE the
 * signature guard below on purpose — that guard skips the DOM rebuild when the
 * cards already match, and a push must not be skipped with it.
 * @param snapshot - the session on screen and its draft's chip occurrences.
 */
export function renderAttachmentBar(snapshot: RailSnapshot): void {
  ensureStylesInjected()
  lastSnapshot = snapshot
  if (snapshot.sessionId !== '') lastActiveSessionId = snapshot.sessionId

  const attachments = activeRecords(snapshot)

  // The host cannot see this draft, so the live set is pushed from the one place
  // that already knows it. De-duplicated inside `syncActiveRefs`, since this runs
  // once per keystroke.
  syncActiveRefs(snapshot.sessionId, attachments)

  const containerId = 'dsh-vision-attachments-rail'
  const container = document.getElementById(containerId)
  const signature = `${snapshot.sessionId}\u0000${attachments.map(r => r.ref).join('\u0000')}`

  // The composer re-renders on every keystroke and the rail entry pushes the live
  // draft in on each one: rebuilding identical cards would drop and re-request
  // their thumbnails for nothing. A container that is missing (or lingering) when
  // it should not be still re-renders — React can replace the composer card under
  // the rail.
  const railIsCurrent = container !== null
  const railShouldExist = attachments.length > 0
  if (signature === lastRenderedSignature && railIsCurrent === railShouldExist) return
  lastRenderedSignature = signature

  if (!railShouldExist) {
    if (container) container.remove()
    return
  }

  const composerCard = document.querySelector('[data-composer-card="true"]')
  if (!composerCard) {
    return
  }

  const scrollDiv = composerCard.querySelector('[data-input-scroll]')

  let host = container
  if (host === null) {
    host = document.createElement('div')
    host.id = containerId
    if (scrollDiv) {
      composerCard.insertBefore(host, scrollDiv)
    } else {
      composerCard.prepend(host)
    }
  }

  host.innerHTML = ''

  const rail = document.createElement('div')
  rail.className = 'dsh-vision-rail'

  for (const record of attachments) {
    if (record.isPhoto) {
      const previewUrl = attachmentViewUrl(snapshot.sessionId, record.relativePath)

      const photoCard = document.createElement('div')
      photoCard.className = 'dsh-vision-item dsh-vision-item-photo'

      const thumb = document.createElement('div')
      thumb.className = 'dsh-vision-thumb'
      thumb.title = `Xem ảnh ${record.token}`
      thumb.onclick = () => openImageLightbox(previewUrl, record.token)

      const img = document.createElement('img')
      img.src = previewUrl
      img.alt = record.token
      thumb.appendChild(img)
      photoCard.appendChild(thumb)

      const removeBtn = document.createElement('button')
      removeBtn.className = 'dsh-vision-remove'
      removeBtn.title = `Bỏ ảnh ${record.token}`
      removeBtn.innerHTML = CLOSE_ICON_SVG
      removeBtn.onclick = (e) => {
        e.stopPropagation()
        removeDraftAttachment(snapshot.sessionId, record.ref)
      }
      photoCard.appendChild(removeBtn)

      rail.appendChild(photoCard)
    } else {
      const ext = record.token.includes('.') ? record.token.split('.').pop()!.toUpperCase() : 'FILE'

      const fileCard = document.createElement('div')
      fileCard.className = 'dsh-vision-item'

      const cardInner = document.createElement('div')
      cardInner.className = 'dsh-vision-file-card'
      cardInner.title = `${record.token} (${formatFileSize(record.size)})`

      const badge = document.createElement('div')
      badge.className = 'dsh-vision-file-badge'
      badge.innerText = ext.slice(0, 4)
      cardInner.appendChild(badge)

      const meta = document.createElement('div')
      meta.className = 'dsh-vision-file-meta'
      meta.innerHTML = `
        <span class="dsh-vision-file-name" title="${record.token}">${record.token}</span>
        <span class="dsh-vision-file-size">${formatFileSize(record.size)}</span>
      `
      cardInner.appendChild(meta)
      fileCard.appendChild(cardInner)

      const removeBtn = document.createElement('button')
      removeBtn.className = 'dsh-vision-remove'
      removeBtn.title = `Bỏ tệp ${record.token}`
      removeBtn.innerHTML = CLOSE_ICON_SVG
      removeBtn.onclick = (e) => {
        e.stopPropagation()
        removeDraftAttachment(snapshot.sessionId, record.ref)
      }
      fileCard.appendChild(removeBtn)

      rail.appendChild(fileCard)
    }
  }

  host.appendChild(rail)
}

// Session switches are the one change no render reports to the rail: the composer
// card is the SAME DOM element across sessions, so the cards of the session just
// left would otherwise stay on screen. The watcher keeps only that job — and when
// its last snapshot belongs to another session it renders NOTHING, because cards
// for the wrong session are worse than an empty rail.
if (typeof window !== 'undefined') {
  let prevSessionId: string | null = null
  setInterval(() => {
    const currentSid = detectActiveSessionId()
    if (currentSid === prevSessionId) return
    prevSessionId = currentSid
    if (lastSnapshot !== null && lastSnapshot.sessionId === currentSid) {
      renderAttachmentBar(lastSnapshot)
      return
    }
    renderAttachmentBar({ sessionId: currentSid ?? '', occurrences: [] })
  }, 250)
}
