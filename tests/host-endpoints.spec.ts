import { describe, it, expect, vi } from 'vitest'
import { handleCheckVision, handleListUploads, handleUpload, handleViewFile } from '../src/host/endpoints.ts'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('host endpoints', () => {
  it('detects model vision capability correctly', async () => {
    const mockLlm = {
      resolveModelInfo: vi.fn().mockResolvedValue({
        id: 'gpt-4o',
        inputModalities: ['text', 'image'],
      }),
    }
    const result = await handleCheckVision(mockLlm as any, 'openai', 'gpt-4o')
    expect(result.hasVision).toBe(true)
    expect(result.model).toBe('gpt-4o')
  })

  it('reports no vision if model only has text modality', async () => {
    const mockLlm = {
      resolveModelInfo: vi.fn().mockResolvedValue({
        id: 'deepseek-chat',
        inputModalities: ['text'],
      }),
    }
    const result = await handleCheckVision(mockLlm as any, 'deepseek', 'deepseek-chat')
    expect(result.hasVision).toBe(false)
  })

  it('saves uploaded file to uploads directory', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-upload-'))
    try {
      const base64Data = Buffer.from('hello world').toString('base64')
      const result = await handleUpload(tempDir, 'test.txt', base64Data, false)
      expect(result.ok).toBe(true)
      expect(result.relativePath).toBe('uploads/test.txt')

      const saved = await readFile(result.fullPath!, 'utf8')
      expect(saved).toBe('hello world')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('isolates uploads per session ID', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-upload-session-'))
    try {
      const b64A = Buffer.from('session A file').toString('base64')
      const b64B = Buffer.from('session B file').toString('base64')

      const resA = await handleUpload(tempDir, 'doc.txt', b64A, false, 'session-123')
      const resB = await handleUpload(tempDir, 'doc.txt', b64B, false, 'session-456')

      expect(resA.relativePath).toBe('uploads/session-123/doc.txt')
      expect(resB.relativePath).toBe('uploads/session-456/doc.txt')

      const listA = await handleListUploads(tempDir, 'session-123')
      expect(listA.files.length).toBe(1)
      expect(listA.files[0].relativePath).toBe('uploads/session-123/doc.txt')

      const listB = await handleListUploads(tempDir, 'session-456')
      expect(listB.files.length).toBe(1)
      expect(listB.files[0].relativePath).toBe('uploads/session-456/doc.txt')

      const viewA = await handleViewFile(tempDir, resA.relativePath!)
      expect(viewA.buffer?.toString()).toBe('session A file')

      const viewB = await handleViewFile(tempDir, resB.relativePath!)
      expect(viewB.buffer?.toString()).toBe('session B file')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('lists uploaded files and views an uploaded file', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'dsh-upload-list-'))
    try {
      const b64 = Buffer.from('image content').toString('base64')
      await handleUpload(tempDir, 'photo.png', b64, true)

      const listRes = await handleListUploads(tempDir)
      expect(listRes.ok).toBe(true)
      expect(listRes.files.length).toBe(1)
      expect(listRes.files[0].name).toBe('photo.png')
      expect(listRes.files[0].isPhoto).toBe(true)

      const viewRes = await handleViewFile(tempDir, 'uploads/photo.png')
      expect(viewRes.found).toBe(true)
      expect(viewRes.contentType).toBe('image/png')
      expect(viewRes.buffer?.toString()).toBe('image content')
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
