import { describe, it, expect, beforeEach } from 'vitest'
import { AttachmentStore, type KeyValueStorage } from '../src/client/attachment-store.js'
import { makeRef } from '../src/client/attachments.js'

function memoryStorage(): KeyValueStorage & { dump: () => Record<string, string> } {
  const map = new Map<string, string>()
  return {
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v) },
    removeItem: k => { map.delete(k) },
    // localStorage's enumeration surface. `byRef` scans persisted sessions with
    // it, so a store reopened over the same storage can still resolve a ref it
    // never cached — which is the case a draft restored after a reload hits.
    get length() { return map.size },
    key: i => [...map.keys()][i] ?? null,
    dump: () => Object.fromEntries(map),
  }
}

const record = (sessionTag: string, token: string) => ({
  token, ref: makeRef(sessionTag, token), relativePath: `uploads/${sessionTag}/${token}`,
  isPhoto: true, size: 1, uploadedAt: 1,
})

describe('AttachmentStore', () => {
  let storage: ReturnType<typeof memoryStorage>
  let store: AttachmentStore

  beforeEach(() => {
    storage = memoryStorage()
    store = new AttachmentStore(storage)
  })

  it('keeps sessions isolated', () => {
    store.add('s1', record('aaa', 'a.png'))
    store.add('s2', record('bbb', 'b.png'))
    expect(store.tokens('s1')).toEqual(['a.png'])
    expect(store.tokens('s2')).toEqual(['b.png'])
  })

  it('resolves a record by ref without knowing the session', () => {
    const r = record('aaa', 'a.png')
    store.add('s1', r)
    expect(store.byRef(r.ref)?.token).toBe('a.png')
    expect(store.byRef('nope')).toBeUndefined()
  })

  it('mints a non-colliding token for the session', () => {
    store.add('s1', record('aaa', 'photo.png'))
    expect(store.nextToken('s1', 'photo.png')).toBe('photo_2.png')
    expect(store.nextToken('s1', 'other.png')).toBe('other.png')
  })

  it('survives a reload from the same storage', () => {
    store.add('s1', record('aaa', 'a.png'))
    const reopened = new AttachmentStore(storage)
    expect(reopened.tokens('s1')).toEqual(['a.png'])
    expect(reopened.byRef(makeRef('aaa', 'a.png'))?.token).toBe('a.png')
  })

  it('drops a record on remove', () => {
    store.add('s1', record('aaa', 'a.png'))
    store.remove('s1', 'a.png')
    expect(store.tokens('s1')).toEqual([])
    expect(store.byRef(makeRef('aaa', 'a.png'))).toBeUndefined()
  })

  it('ignores corrupt stored JSON instead of throwing', () => {
    storage.setItem('dsh_vision_attachments_s1', '{not json')
    expect(store.tokens('s1')).toEqual([])
  })
})
