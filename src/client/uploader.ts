import type { FileUploadResponse, VisionCheckResponse } from '../types.js'

export function generateFileDraftPrompt(relativePath: string, isPhoto: boolean): string {
  if (isPhoto) {
    return `Tôi vừa tải lên ảnh \`${relativePath}\`. Bạn hãy gọi tool \`read_image\` để xem và phân tích ảnh này nhé: `
  }
  return `Tôi vừa tải lên file \`${relativePath}\`. Bạn hãy đọc nội dung file này (dùng tool \`read\` hoặc tool đọc file phù hợp) và hỗ trợ tôi: `
}

export async function checkModelVision(sessionId: string): Promise<VisionCheckResponse> {
  try {
    const res = await fetch(`/api/vision-plugin/check-vision?sessionId=${encodeURIComponent(sessionId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err: any) {
    return {
      hasVision: true, // Optimistic fallback if network request fails
    }
  }
}

export function pickFileFromBrowser(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'

    input.onchange = () => {
      const file = input.files?.[0] ?? null
      document.body.removeChild(input)
      resolve(file)
    }

    input.oncancel = () => {
      document.body.removeChild(input)
      resolve(null)
    }

    document.body.appendChild(input)
    input.click()
  })
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function uploadFileToWorkspace(
  sessionId: string,
  file: File,
  isPhoto: boolean
): Promise<FileUploadResponse> {
  const fileBase64 = await fileToBase64(file)
  const res = await fetch('/api/vision-plugin/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      fileName: file.name,
      fileBase64,
      isPhoto,
    }),
  })

  if (!res.ok) {
    throw new Error(`Upload failed with status ${res.status}`)
  }
  return await res.json()
}
