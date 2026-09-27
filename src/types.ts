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

/** The body of the plugin's ref-sync endpoint (`src/host/endpoints.ts`). */
export interface SyncRefsPayload {
  sessionId: string
  refs: PendingAttachment[]
}

/** What the ref-sync endpoint answers. */
export interface SyncRefsResponse {
  ok: boolean
  /** How many refs the host now holds for the session. */
  count: number
  error?: string
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
