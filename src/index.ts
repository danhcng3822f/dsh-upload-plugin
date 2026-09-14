import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleCheckVision, handleListUploads, handleUpload, handleViewFile } from './host/endpoints.js'

export const name = 'dsh-upload-plugin'

function resolveWorkspace(ctx: Context, sessionId?: string, explicitWs?: string): string {
  if (explicitWs) return explicitWs

  const workspaceRegistry = ctx.get('workspaceRegistry') as any
  if (workspaceRegistry && typeof workspaceRegistry.list === 'function') {
    const list = workspaceRegistry.list() as Array<{ id: string; path: string; sessionIds?: string[] }>
    if (sessionId) {
      const matching = list.find(w => w.sessionIds?.includes(sessionId))
      if (matching?.path) return matching.path
    }
    if (list[0]?.path) return list[0].path
  }

  if (sessionId) {
    const sessions = ctx.get('sessions') as any
    const session = sessions?.get?.(sessionId)
    if (session?.header?.cwd) return session.header.cwd
  }

  return process.cwd()
}

export function apply(ctx: Context): void {
  // Inject webServer route if webServer is available
  ctx.inject(['webServer'], (scoped: Context) => {
    const webServer = scoped.get('webServer') as any
    if (!webServer) return

    // 1. Endpoint: Check vision
    webServer.register({
      kind: 'prefix',
      path: '/api/vision-plugin/check-vision',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
        const sessionId = url.searchParams.get('sessionId')

        let provider = url.searchParams.get('provider') ?? undefined
        let model = url.searchParams.get('model') ?? undefined

        if ((!provider || !model) && sessionId) {
          const sessions = ctx.get('sessions') as any
          const session = sessions?.get?.(sessionId)
          const config = session?.requestHeader?.()?.config
          if (config) {
            provider = provider ?? config.provider
            model = model ?? config.model
          }
        }

        const llm = ctx.get('llm')
        const result = await handleCheckVision(llm, provider, model)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      },
    })

    // 2. Endpoint: Upload file
    webServer.register({
      kind: 'exact',
      path: '/api/vision-plugin/upload',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'Method Not Allowed' }))
          return
        }

        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body)
            const { sessionId, workspaceDir: explicitWs, fileName, fileBase64, isPhoto } = payload
            const workspaceDir = resolveWorkspace(ctx, sessionId, explicitWs)

            const response = await handleUpload(
              workspaceDir,
              fileName,
              fileBase64,
              Boolean(isPhoto),
              sessionId
            )
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: err?.message ?? 'Invalid request payload' }))
          }
        })
      },
    })

    // 3. Endpoint: List uploaded files in workspace for specific session
    webServer.register({
      kind: 'prefix',
      path: '/api/vision-plugin/list',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
        const sessionId = url.searchParams.get('sessionId') ?? undefined
        const explicitWs = url.searchParams.get('workspaceDir') ?? undefined
        const workspaceDir = resolveWorkspace(ctx, sessionId, explicitWs)

        const result = await handleListUploads(workspaceDir, sessionId)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      },
    })

    // 4. Endpoint: View / stream an uploaded file
    webServer.register({
      kind: 'prefix',
      path: '/api/vision-plugin/view',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
        const file = url.searchParams.get('file') ?? ''
        const sessionId = url.searchParams.get('sessionId') ?? undefined
        const explicitWs = url.searchParams.get('workspaceDir') ?? undefined
        const workspaceDir = resolveWorkspace(ctx, sessionId, explicitWs)

        if (!file) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing file parameter')
          return
        }

        const result = await handleViewFile(workspaceDir, file)
        if (!result.found || !result.buffer) {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end(result.error ?? 'File not found')
          return
        }

        res.writeHead(200, {
          'Content-Type': result.contentType ?? 'application/octet-stream',
          'Content-Length': result.buffer.length,
          'Cache-Control': 'no-cache',
        })
        res.end(result.buffer)
      },
    })
  })
}
