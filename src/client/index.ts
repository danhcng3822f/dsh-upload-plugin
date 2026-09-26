import type { Context } from '@deepseek-ai/cordis'
import { registerVisionCommands } from './commands.js'

export const name = 'dsh-upload-plugin-client'

export function apply(ctx: Context): void {
  registerVisionCommands(ctx)
}
