export interface VisionCheckResponse {
  hasVision: boolean
  provider?: string
  model?: string
  reason?: string
}

export interface FileUploadPayload {
  sessionId: string
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
