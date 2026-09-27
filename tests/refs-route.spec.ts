/**
 * The refs route as the web server sees it: one path, two methods.
 *
 * `src/index.ts` is otherwise untested — the handlers in `src/host/endpoints.ts`
 * carry the logic and are covered directly — but the method branch is the part
 * that lives only in the route, and getting it wrong is invisible from the
 * handlers: a GET answered by the sync handler would return
 * `{ ok: false, count: 0, error: 'Method Not Allowed' }`, which reads exactly
 * like "the host holds nothing".
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { apply } from '../src/index.js'
import { clearRefs } from '../src/host/refs-store.js'

interface Route {
  kind: string
  path: string
  handler: (req: any, res: any) => unknown
}

/**
 * A stand-in for the cordis context: enough to capture the routes `apply`
 * registers on the web server, plus the two listeners it registers directly.
 */
function fakeCtx() {
  const routes: Route[] = []
  const listeners = new Map<string, (...args: any[]) => any>()
  const ctx = {
    on(event: string, handler: (...args: any[]) => any) { listeners.set(event, handler) },
    get(name: string) {
      if (name !== 'webServer') return undefined
      return { register: (route: Route) => { routes.push(route) } }
    },
    inject(_deps: string[], cb: (scoped: unknown) => void) { cb(ctx) },
  }
  return { ctx, routes, listeners }
}

/** A request the route handler can read: method, url, headers and a JSON body. */
class FakeRequest extends EventEmitter {
  readonly headers: Record<string, string> = { host: 'localhost' }
  constructor(
    readonly method: string,
    readonly url: string,
    private readonly body = '',
  ) { super() }
}

/** A response that records what the handler wrote. */
class FakeResponse {
  statusCode = 0
  headers: Record<string, string> = {}
  body = ''
  writeHead(code: number, headers: Record<string, string> = {}) {
    this.statusCode = code
    this.headers = headers
    return this
  }
  end(chunk?: unknown) { this.body = typeof chunk === 'string' ? chunk : String(chunk ?? '') }
  json(): any { return JSON.parse(this.body) }
}

const REFS_PATH = '/api/vision-plugin/refs'

function refsRoute(): Route {
  const { ctx, routes } = fakeCtx()
  apply(ctx as never)
  const route = routes.find(candidate => candidate.path === REFS_PATH)
  if (route === undefined) throw new Error(`no route registered for ${REFS_PATH}`)
  return route
}

/** Drive one request through the real route handler, body and all. */
function request(method: string, url: string, body?: unknown): Promise<FakeResponse> {
  const route = refsRoute()
  const req = new FakeRequest(method, url, body === undefined ? '' : JSON.stringify(body))
  const res = new FakeResponse()
  const done = route.handler(req, res)
  if (body !== undefined) req.emit('data', JSON.stringify(body))
  req.emit('end')
  return Promise.resolve(done).then(() => res)
}

beforeEach(() => { clearRefs('s1') })

describe('the refs route', () => {
  it('registers exactly one route for the path, and registers the injection too', () => {
    const { ctx, routes, listeners } = fakeCtx()
    apply(ctx as never)
    expect(routes.filter(route => route.path === REFS_PATH)).toHaveLength(1)
    // The injection is registered outside the webServer injection on purpose: a
    // headless deployment has agents but no web server.
    expect(listeners.get('agent/pre-step')).toBeTypeOf('function')
    expect(listeners.get('session/disposed')).toBeTypeOf('function')
  })

  it('answers GET with the host\'s held state', async () => {
    await request('POST', REFS_PATH, {
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
    })

    const res = await request('GET', `${REFS_PATH}?sessionId=s1`)
    expect(res.statusCode).toBe(200)
    expect(res.headers['Content-Type']).toBe('application/json')
    expect(res.json()).toEqual({
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
      spent: false,
    })
  })

  it('answers GET for a session that never pushed with an empty set', async () => {
    const res = await request('GET', `${REFS_PATH}?sessionId=never`)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ sessionId: 'never', refs: [], spent: false })
  })

  it('leaves the POST answer byte-for-byte as the client depends on it', async () => {
    const res = await request('POST', REFS_PATH, {
      sessionId: 's1',
      refs: [
        { ref: 'a', relativePath: 'uploads/s/a.png', isPhoto: true },
        { ref: 'b', relativePath: 'uploads/s/b.txt', isPhoto: false },
      ],
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, count: 2 })
  })

  it('still answers a malformed POST with 400 and the same body', async () => {
    const res = await request('POST', REFS_PATH, { sessionId: 's1', refs: 'nope' })
    expect(res.statusCode).toBe(400)
    expect(res.json().ok).toBe(false)
    expect(res.json().count).toBe(0)
  })

  it('refuses any other method with the same 405 the client already handles', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const res = await request(method, REFS_PATH)
      expect(res.statusCode).toBe(405)
      expect(res.json()).toEqual({ ok: false, count: 0, error: 'Method Not Allowed' })
    }
  })

  it('does not let a GET read a session the POST never wrote', async () => {
    await request('POST', REFS_PATH, {
      sessionId: 's1',
      refs: [{ ref: 'a', relativePath: 'uploads/s/a.txt', isPhoto: false }],
    })
    expect((await request('GET', `${REFS_PATH}?sessionId=other`)).json().refs).toEqual([])
  })
})
