export interface VisionCheckResponse {
  hasVision: boolean
  provider?: string
  model?: string
  reason?: string
}

export interface FileUploadPayload {
  sessionId: string
  workspaceDir?: string
  fileName: string
  fileBase64: string
  isPhoto: boolean
}

export interface FileUploadResponse {
  ok: boolean
  filename?: string
  relativePath?: string
  fullPath?: string
  isPhoto?: boolean
  error?: string
}

export interface UploadedFileInfo {
  name: string
  relativePath: string
  size: number
  mtime: number
  isPhoto: boolean
  viewUrl?: string
}

export interface UploadListResponse {
  ok: boolean
  files: UploadedFileInfo[]
  error?: string
}

/**
 * One live attachment as the client reports it to the host (R25-B2).
 *
 * Deliberately a projection of the client's `AttachmentRecord`
 * (`src/client/attachments.ts`) rather than the record itself: the host needs
 * only what renders the instruction — the workspace path and the photo/file
 * distinction — so `token`, `size` and `uploadedAt` never cross the wire. The
 * client stays the single owner of the full record.
 */
export interface PendingAttachment {
  /** The chip's reference id; the identity a re-push is compared by. */
  ref: string
  /** Workspace-relative path, e.g. `uploads/<session>/photo.png`. */
  relativePath: string
  /** Which tool the instruction asks for: `read_image` when true, `read` when false. */
  isPhoto: boolean
}

/**
 * Why the client is reporting a set (R31).
 *
 * The live set crosses the process boundary as a plain "here is what is in the
 * draft", and for every non-empty set that is enough. An EMPTY set is not: it
 * means either "the user took the attachments back" (the host must forget them)
 * or "my draft was committed" (the host must keep them for the turn about to
 * run). The two need opposite treatment, so the client — the only side that can
 * tell them apart — says which one it is.
 *
 * - `live` — the live set changed to what this push carries. The client only
 *   issues this when the set differs from the last one it reported, so an
 *   identical set arriving as `live` is a re-attachment the user just made (the
 *   same file referenced again through `/photos`) and it re-arms the held set.
 * - `retry` — the same set again, because the previous push's response was never
 *   confirmed. It must not resurrect a set a step has already spent.
 * - `sent` — the draft was committed, so the set the client last reported still
 *   belongs to the turn about to run. The host keeps it, spent flag included.
 * - `removed` — the user removed the attachments. The host forgets them.
 *
 * Absent (an older client) is not an error: see `parsePushReason`, which defaults
 * to exactly the behaviour this store had before reasons existed.
 */
export type RefPushReason = 'live' | 'retry' | 'sent' | 'removed'

/** The body of the plugin's ref-sync endpoint (`src/host/endpoints.ts`). */
export interface SyncRefsPayload {
  sessionId: string
  refs: PendingAttachment[]
  /** Why this set is being reported; absent from a client that predates R31. */
  reason?: RefPushReason
}

/**
 * One push as the host recorded it, for the diagnostic `log` (R31).
 *
 * The instrument that settles "the client pushed nothing" against "the client
 * pushed an empty set" against "the host dropped it" in ONE request: a `GET`
 * now shows `{count: 1}` followed by `{count: 0, reason: 'sent'}` and the
 * question is answered without a second test round.
 *
 * Deliberately four fields and no more — a count, a reason, a timestamp, and
 * nothing that identifies a file.
 */
export interface RefPushRecord {
  /** Epoch milliseconds, as the host recorded the push. */
  at: number
  /** How many refs the push carried, after malformed rows were dropped. */
  count: number
  /** Why the client said it was reporting them. */
  reason: RefPushReason
}

/** What the ref-sync endpoint answers. */
export interface SyncRefsResponse {
  ok: boolean
  /** How many refs the host now holds for the session. */
  count: number
  error?: string
}

/**
 * What the ref-sync endpoint answers to a GET: the host's own view of a session.
 *
 * The same facts a diagnosis needs — which session was asked about, what the host
 * holds, whether a step has already injected it, and the pushes that produced
 * that state — and nothing else: no file paths beyond the ones a push already
 * carried, and no session enumeration.
 */
export interface ReadRefsResponse {
  /** Echoed back, so a mistyped query parameter is visible rather than silent. */
  sessionId: string
  /** The held set, oldest first; empty for a session the host never heard of. */
  refs: PendingAttachment[]
  /** Whether a step has already claimed this set and injected it. */
  spent: boolean
  /**
   * The last pushes for this session, oldest first, bounded to
   * `PUSH_LOG_LIMIT`. Empty for a session the host never heard of.
   */
  log: RefPushRecord[]
}

export interface AttachedItem {
  id: string
  name: string
  relativePath: string
  size: number
  isPhoto: boolean
  dataUrl?: string
  viewUrl?: string
}
