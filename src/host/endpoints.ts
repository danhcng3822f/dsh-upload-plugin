import { writeFile } from 'node:fs/promises'
import { basename, join, relative } from 'node:path'
import type { FileUploadResponse, VisionCheckResponse } from '../types.js'
import { isSupportedPhotoExtension, resolveUniqueUploadPath } from './file-utils.js'

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
  isPhoto: boolean
): Promise<FileUploadResponse> {
  try {
    const uploadsDir = join(workspaceDir, 'uploads')
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
