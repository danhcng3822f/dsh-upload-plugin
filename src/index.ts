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

            let workspaceDir = explicitWs
            if (!workspaceDir) {
              const workspaceRegistry = ctx.get('workspaceRegistry') as any
              if (workspaceRegistry && typeof workspaceRegistry.list === 'function') {
                const list = workspaceRegistry.list() as Array<{ id: string; path: string; sessionIds?: string[] }>
                const matching = list.find(w => w.sessionIds?.includes(sessionId))
                if (matching?.path) {
                  workspaceDir = matching.path
                } else if (list[0]?.path) {
                  workspaceDir = list[0].path
                }
              }
            }

            // Fallback to session cwd or process cwd
            if (!workspaceDir && sessionId) {
              const sessions = ctx.get('sessions') as any
              const session = sessions?.get?.(sessionId)
              if (session?.header?.cwd) {
                workspaceDir = session.header.cwd
              }
            }
            if (!workspaceDir) {
              workspaceDir = process.cwd()
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
