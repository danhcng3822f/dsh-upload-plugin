import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, normalize, relative, resolve } from 'node:path'
import type {
  FileUploadResponse, ReadRefsResponse, SyncRefsResponse, UploadedFileInfo, UploadListResponse,
  VisionCheckResponse,
} from '../types.js'
import { isSupportedPhotoExtension, resolveUniqueUploadPath } from './file-utils.js'
import { parsePendingAttachment, parsePushReason, readRefs, syncRefs } from './refs-store.js'

export async function handleCheckVision(
  llm: any,
  provider?: string,
  model?: string
): Promise<VisionCheckResponse> {
  if (!provider || !model) {
    return {
      hasVision: false,
      reason: 'No active provider/model identified for current session',
    }
  }

  if (!llm || typeof llm.resolveModelInfo !== 'function') {
    return {
      hasVision: true, // Fallback if llm service not introspectable
      provider,
      model,
    }
  }

  try {
    const info = await llm.resolveModelInfo(provider, model)
    const modalities: string[] = info.inputModalities ?? ['text']
    const hasVision = modalities.includes('image')
    return {
      hasVision,
      provider,
      model,
      reason: hasVision ? undefined : `Model "${model}" does not declare image input modality`,
    }
  } catch (err: any) {
    return {
      hasVision: false,
      provider,
      model,
      reason: err?.message ?? 'Failed to query model info',
    }
  }
}

export async function handleUpload(
  workspaceDir: string,
  originalName: string,
  base64Data: string,
  isPhoto: boolean,
  sessionId?: string
): Promise<FileUploadResponse> {
  try {
    const safeSessionId = sessionId ? sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') : ''
    const uploadsDir = safeSessionId
      ? join(workspaceDir, 'uploads', safeSessionId)
      : join(workspaceDir, 'uploads')

    const targetPath = await resolveUniqueUploadPath(uploadsDir, originalName)
    const buffer = Buffer.from(base64Data, 'base64')
    await writeFile(targetPath, buffer)

    const finalName = basename(targetPath)
    const relPath = relative(workspaceDir, targetPath).replace(/\\/g, '/')

    return {
      ok: true,
      filename: finalName,
      relativePath: relPath,
      fullPath: targetPath,
      isPhoto,
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? 'Failed to write upload file',
    }
  }
}

export async function handleListUploads(
  workspaceDir: string,
  sessionId?: string
): Promise<UploadListResponse> {
  try {
    const safeSessionId = sessionId ? sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') : ''
    const uploadsDir = safeSessionId
      ? join(workspaceDir, 'uploads', safeSessionId)
      : join(workspaceDir, 'uploads')

    const entries = await readdir(uploadsDir, { withFileTypes: true }).catch(() => [])
    const files: UploadedFileInfo[] = []

    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = join(uploadsDir, entry.name)
        const st = await stat(fullPath).catch(() => null)
        if (!st) continue
        const isPhoto = isSupportedPhotoExtension(entry.name)
        const relPath = relative(workspaceDir, fullPath).replace(/\\/g, '/')
        files.push({
          name: entry.name,
          relativePath: relPath,
          size: st.size,
          mtime: Math.round(st.mtimeMs),
          isPhoto,
          viewUrl: `/api/vision-plugin/view?file=${encodeURIComponent(relPath)}`,
        })
      }
    }

    // Sort newest first
    files.sort((a, b) => b.mtime - a.mtime)
    return { ok: true, files }
  } catch (err: any) {
    return { ok: false, files: [], error: err?.message ?? 'Failed to list uploads' }
  }
}

/**
 * Record which attachments are live in one session's draft (R25-B2).
 *
 * The client is the only side that knows this — the chips live in its composer
 * draft — so it pushes the set here whenever it changes, and the
 * `agent/pre-step` injection claims it on the next turn
 * (`src/host/context-injection.ts`).
 *
 * The body is untrusted by shape even though it comes from this plugin's own
 * client: a malformed row would otherwise reach `instructionFor` and render
 * `undefined` into the model's context. Rows that do not validate are dropped
 * rather than failing the whole push, because a partially-recognized set still
 * points the model at the attachments it can name, while a rejected push would
 * silently lose all of them.
 *
 * `reason` (R31) is what makes an empty set decidable — a committed send keeps
 * the held refs for the turn about to run, a removal clears them — and it is
 * parsed with the same leniency: an absent or unknown value falls back to the
 * behaviour an older client relied on (`parsePushReason`).
 * @param payload - the parsed request body.
 * @returns the outcome, with the count the host now holds for the session.
 */
export async function handleSyncRefs(payload: unknown): Promise<SyncRefsResponse> {
  try {
    if (typeof payload !== 'object' || payload === null) {
      return { ok: false, count: 0, error: 'Invalid request payload' }
    }
    const body = payload as Record<string, unknown>
    const sessionId = body['sessionId']
    if (typeof sessionId !== 'string' || sessionId === '') {
      return { ok: false, count: 0, error: 'Missing sessionId' }
    }
    const raw = body['refs']
    if (!Array.isArray(raw)) {
      return { ok: false, count: 0, error: 'Missing refs array' }
    }

    const refs = raw.map(parsePendingAttachment).filter(record => record !== undefined)
    syncRefs(sessionId, refs, parsePushReason(body['reason'], refs.length))
    return { ok: true, count: refs.length }
  } catch (err: any) {
    return { ok: false, count: 0, error: err?.message ?? 'Failed to sync refs' }
  }
}

/**
 * Read the host's view of one session's refs (R29, log added in R31).
 *
 * The write half — `handleSyncRefs` — answers only "how many do you hold now",
 * which is not enough to tell a failed push from a failed injection after the
 * fact. This is the read half: the held set, its spent flag, and the last pushes
 * that produced them, so one request after a send says which half of the feature
 * broke — including the case where the client pushed an empty set on purpose.
 *
 * It is total rather than validating: a missing or unknown `sessionId` answers
 * the empty, unspent set with no pushes, and the echoed `sessionId` is what tells
 * the caller the parameter arrived. A 400 here would be one more thing to decode
 * while diagnosing, which is the cost this endpoint exists to remove.
 * @param sessionId - the session from the query string, or undefined when absent.
 * @returns what the store holds for that session right now.
 */
export async function handleReadRefs(sessionId: string | undefined): Promise<ReadRefsResponse> {
  const id = typeof sessionId === 'string' ? sessionId : ''
  const { refs, spent, log } = readRefs(id)
  return { sessionId: id, refs, spent, log }
}

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
}

export async function handleViewFile(
  workspaceDir: string,
  relFile: string
): Promise<{ found: boolean; buffer?: Buffer; contentType?: string; error?: string }> {
  try {
    const safeRel = normalize(relFile).replace(/^(\.\.(\/|\\|$))+/, '')
    const targetPath = resolve(workspaceDir, safeRel)

    // Security check: must reside inside workspaceDir
    const relFromWs = relative(workspaceDir, targetPath)
    if (relFromWs.startsWith('..') || resolve(targetPath) !== targetPath) {
      return { found: false, error: 'Access denied' }
    }

    const data = await readFile(targetPath)
    const ext = extname(targetPath).toLowerCase()
    const contentType = MIME_MAP[ext] ?? 'application/octet-stream'

    return { found: true, buffer: data, contentType }
  } catch (err: any) {
    return { found: false, error: err?.message ?? 'File not found' }
  }
}
