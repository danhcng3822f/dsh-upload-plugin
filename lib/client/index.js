import { registerVisionCommands } from './commands.js';
export const name = 'dsh-vision-plugin-client';
export function apply(ctx) {
    registerVisionCommands(ctx);
}
