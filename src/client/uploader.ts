import type { FileUploadResponse, VisionCheckResponse } from '../types.js'

export function generateFileDraftPrompt(relativePath: string, isPhoto: boolean): string {
  if (isPhoto) {
    return `Tôi vừa tải lên ảnh \`${relativePath}\`. Bạn hãy gọi tool \`read_image\` để xem và phân tích ảnh này nhé: `
  }
  return `Tôi vừa tải lên file \`${relativePath}\`. Bạn hãy đọc nội dung file này (dùng tool \`read\` hoặc tool đọc file phù hợp) và hỗ trợ tôi: `
}

export async function checkModelVision(sessionId: string): Promise<VisionCheckResponse> {
  try {
    let provider = ''
    let model = ''

    // 1. Query current session model via DSH RPC
    try {
      const modelRes = await fetch('/api/session.models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `vision-check-${Date.now()}`,
          method: 'session.models',
          payload: { sessionId },
        }),
      })
      if (modelRes.ok) {
        const data = await modelRes.json()
        const current = data?.result?.value?.current
        if (current?.provider && current?.model) {
          provider = current.provider
          model = current.model
        }
      }
    } catch {
      // Ignore RPC error, fallback to query without params
    }

    const query = new URLSearchParams()
    query.set('sessionId', sessionId)
    if (provider) query.set('provider', provider)
    if (model) query.set('model', model)

    const res = await fetch(`/api/vision-plugin/check-vision?${query.toString()}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err: any) {
    return {
      hasVision: true, // Optimistic fallback if network request fails
    }
  }
}

export async function resolveWorkspaceDir(sessionId: string): Promise<string | null> {
  try {
    const res = await fetch('/api/workspace.list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `ws-resolve-${Date.now()}`,
        method: 'workspace.list',
        payload: {},
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const items = data?.result?.value?.items as Array<{ path: string; sessionIds?: string[] }> | undefined
      const match = items?.find(item => item.sessionIds?.includes(sessionId))
      if (match?.path) return match.path
      if (items?.[0]?.path) return items[0].path
    }
  } catch {
    // Ignore RPC error
  }
  return null
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
  const workspaceDir = await resolveWorkspaceDir(sessionId)

  const res = await fetch('/api/vision-plugin/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      workspaceDir,
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

export function insertPromptIntoComposer(prompt: string): void {
  const textarea = document.querySelector('textarea[data-input-target], textarea') as HTMLTextAreaElement | null
  if (textarea) {
    const current = textarea.value
    const newText = current ? `${current}\n${prompt}` : prompt

    // React overrides the value setter, so call native setter to trigger React change tracking
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    if (nativeSetter) {
      nativeSetter.call(textarea, newText)
    } else {
      textarea.value = newText
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    textarea.focus()
  }
}
