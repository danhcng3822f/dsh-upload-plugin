import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleCheckVision, handleUpload } from './host/endpoints.js'

export const name = 'dsh-vision-plugin'

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

        // Resolve current session model via apiproxy / sessions if available
        let provider = url.searchParams.get('provider') ?? undefined
        let model = url.searchParams.get('model') ?? undefined

        const sessions = ctx.get('sessions') as any
        if (sessionId && sessions && typeof sessions.binding === 'function') {
          const binding = sessions.binding(sessionId)
          const config = binding?.session?.requestHeader?.()?.config
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
            const { sessionId, fileName, fileBase64, isPhoto } = payload

            let workspaceDir = process.cwd()
            const workspaceRegistry = ctx.get('workspaceRegistry') as any
            if (workspaceRegistry) {
              const ws = workspaceRegistry.get?.(sessionId) ?? workspaceRegistry.current?.()
              if (ws?.path) workspaceDir = ws.path
            }

            const response = await handleUpload(workspaceDir, fileName, fileBase64, Boolean(isPhoto))
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(response))
          } catch (err: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: err?.message ?? 'Invalid request payload' }))
          }
        })
      },
    })
  })
}
