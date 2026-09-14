import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isSupportedPhotoExtension, resolveUniqueUploadPath } from '../src/host/file-utils.ts'

describe('file-utils', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'dsh-test-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('identifies supported photo extensions correctly', () => {
    expect(isSupportedPhotoExtension('cat.png')).toBe(true)
    expect(isSupportedPhotoExtension('dog.JPG')).toBe(true)
    expect(isSupportedPhotoExtension('photo.jpeg')).toBe(true)
    expect(isSupportedPhotoExtension('img.webp')).toBe(true)
    expect(isSupportedPhotoExtension('anim.gif')).toBe(true)
    expect(isSupportedPhotoExtension('doc.pdf')).toBe(false)
    expect(isSupportedPhotoExtension('code.ts')).toBe(false)
  })

  it('resolves unique path when file does not exist', async () => {
    const resolved = await resolveUniqueUploadPath(tempDir, 'photo.png')
    expect(resolved).toBe(join(tempDir, 'photo.png'))
  })

  it('increments suffix when filename already exists', async () => {
    await writeFile(join(tempDir, 'photo.png'), 'existing')
    const resolved = await resolveUniqueUploadPath(tempDir, 'photo.png')
    expect(resolved).toBe(join(tempDir, 'photo_1.png'))
  })
})
