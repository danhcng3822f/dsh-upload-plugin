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

export interface AttachedItem {
  id: string
  name: string
  relativePath: string
  size: number
  isPhoto: boolean
  dataUrl?: string
  viewUrl?: string
}
