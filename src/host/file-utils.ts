import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

const PHOTO_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

export function isSupportedPhotoExtension(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase()
  return PHOTO_EXTENSIONS.has(ext)
}

export function cleanDisplayName(fileName: string): string {
  // Strip session prefix if present (e.g. session_cf4645e5__doc.txt -> doc.txt)
  return fileName.replace(/^session_[a-zA-Z0-9_-]+__/, '')
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function resolveUniqueUploadPath(uploadsDir: string, originalName: string): Promise<string> {
  await mkdir(uploadsDir, { recursive: true })
  const ext = extname(originalName)
  const base = basename(originalName, ext)

  let candidate = join(uploadsDir, originalName)
  await mkdir(dirname(candidate), { recursive: true })

  let counter = 1
  while (await fileExists(candidate)) {
    candidate = join(uploadsDir, `${base}_${counter}${ext}`)
    counter++
  }

  return candidate
}
