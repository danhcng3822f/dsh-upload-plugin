import { registerVisionCommands } from './commands.js';
export const name = 'dsh-upload-plugin-client';
export function apply(ctx) {
    registerVisionCommands(ctx);
}
