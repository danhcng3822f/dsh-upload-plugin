import {
  addRecord, findRecord, makeRef, makeToken, removeRecord,
  type AttachmentRecord,
} from './attachments.js'

/** The slice of `localStorage` this store needs (injected so tests stay in node). */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /**
   * Enumeration surface. `localStorage` provides it and `byRef` depends on it: a
   * chip restored together with a persisted draft after a reload must resolve
   * against a session this store has not cached yet. A storage without it still
   * serves everything except cross-session `byRef`.
   */
  readonly length?: number
  key?(index: number): string | null
}

const PREFIX = 'dsh_vision_attachments_'

/** The session's short tag, used in refs and file names. */
function sessionTag(sessionId: string): string {
  return sessionId.replace(/^session-/, '').slice(0, 8) || 'common'
}

/**
 * Per-session attachment records, persisted to injected storage.
 *
 * Records are history: they survive a send so `/uploads` can list them. What
 * gets injected is decided by `activeTokens` over the live draft, never by this
 * store — that is what keeps attachment one-shot per send.
 */
export class AttachmentStore {
  private readonly cache = new Map<string, AttachmentRecord[]>()

  constructor(private readonly storage: KeyValueStorage) {}

  /** Records for one session, newest last. */
  list(sessionId: string): readonly AttachmentRecord[] {
    const cached = this.cache.get(sessionId)
    if (cached !== undefined) return cached
    const loaded = this.load(sessionId)
    this.cache.set(sessionId, loaded)
    return loaded
  }

  /** Token list for one session, used for collision-free minting and the lexicon. */
  tokens(sessionId: string): readonly string[] {
    return this.list(sessionId).map(r => r.token)
  }

  /** Mint a token that does not collide within the session. */
  nextToken(sessionId: string, fileName: string): string {
    return makeToken(fileName, this.tokens(sessionId))
  }

  /** The ref for a token in this session — the id the chip carries. */
  refFor(sessionId: string, token: string): string {
    return makeRef(sessionTag(sessionId), token)
  }

  /** Add or replace a record. */
  add(sessionId: string, record: AttachmentRecord): void {
    this.write(sessionId, addRecord(this.list(sessionId), record))
  }

  /** Drop one record by token. */
  remove(sessionId: string, token: string): void {
    this.write(sessionId, removeRecord(this.list(sessionId), token))
  }

  /** Find a record by token within one session. */
  find(sessionId: string, token: string): AttachmentRecord | undefined {
    return findRecord(this.list(sessionId), token)
  }

  /**
   * Resolve a record from its ref alone.
   * `codec.serialize(ref)` receives no session, so this is the lookup the codec uses.
   */
  byRef(ref: string): AttachmentRecord | undefined {
    for (const records of this.allSessions()) {
      const hit = records.find(r => r.ref === ref)
      if (hit !== undefined) return hit
    }
    return undefined
  }

  private allSessions(): AttachmentRecord[][] {
    const out: AttachmentRecord[][] = [...this.cache.values()]
    for (let i = 0; i < this.storageLength(); i++) {
      const key = this.storageKeyAt(i)
      if (key === null || !key.startsWith(PREFIX)) continue
      const sessionId = key.slice(PREFIX.length)
      if (!this.cache.has(sessionId)) out.push(this.load(sessionId))
    }
    return out
  }

  private load(sessionId: string): AttachmentRecord[] {
    const raw = this.storage.getItem(PREFIX + sessionId)
    if (raw === null) return []
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((r): r is AttachmentRecord =>
        typeof r === 'object' && r !== null
        && typeof (r as AttachmentRecord).token === 'string'
        && typeof (r as AttachmentRecord).ref === 'string')
    } catch {
      return []
    }
  }

  private write(sessionId: string, records: AttachmentRecord[]): void {
    this.cache.set(sessionId, records)
    try {
      this.storage.setItem(PREFIX + sessionId, JSON.stringify(records))
    } catch {
      // Quota or privacy mode: the in-memory cache still serves this session.
    }
  }

  /** Number of persisted keys, when the storage exposes enumeration. */
  private storageLength(): number {
    return typeof this.storage.length === 'number' ? this.storage.length : 0
  }

  /** Nth persisted key, when the storage exposes enumeration. */
  private storageKeyAt(index: number): string | null {
    return typeof this.storage.key === 'function' ? this.storage.key(index) : null
  }
}
