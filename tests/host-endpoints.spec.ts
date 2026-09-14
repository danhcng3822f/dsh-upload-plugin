import { describe, it, expect, vi } from 'vitest'
import { handleCheckVision, handleUpload } from '../src/host/endpoints.ts'
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
})
