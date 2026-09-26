import { createElement } from 'react';
import { AttachmentStore } from './attachment-store.js';
import { AttachmentRailEntry, bindAttachmentStore } from './attachment-bar.js';
import { AttachButtons } from './composer/attach-buttons.js';
import { registerVisionCommands } from './commands.js';
import { createVisionSource } from './reference.js';
export const name = 'dsh-upload-plugin-client';
export function apply(ctx) {
    registerVisionCommands(ctx);
    // Task 5 — the composer attach buttons and the reference source they mint
    // through. Storage is injected so the store stays testable in node.
    const store = new AttachmentStore(window.localStorage);
    // One source instance: it owns the ref index the codec resolves against.
    const source = createVisionSource(store);
    ctx.inject(['inputTriggers'], (scoped) => {
        const triggers = scoped.get('inputTriggers');
        scoped.effect(() => triggers.registerSource(source), 'dsh-upload-plugin: vision reference source');
    });
    ctx.inject(['slots', 'sessions'], (scoped) => {
        const slots = scoped.get('slots');
        const sessions = scoped.get('sessions');
        // The brief writes this component inline as JSX; `index.ts` is a `.ts` file,
        // which the TypeScript parser refuses to read as JSX (TS1005), so the same
        // element is built with `createElement` — identical tree and props.
        slots.inject('conversation.input.right', () => slots.register({
            name: 'conversation.input.right',
            id: 'vision-attach',
            order: 10,
        }, (props) => {
            const conversation = ctx.get('conversation');
            // The composer notice channel, in ui-conversation's own shape
            // (`QueueDock.tsx`: `conversation.input.for(actx).notify(level, text)`).
            // A missing channel must never block attachment, so it degrades to the console.
            const notify = (level, text) => {
                const actx = sessions?.scope?.(props.sessionId);
                if (actx === undefined)
                    return;
                const facade = conversation?.input?.for?.(actx);
                if (typeof facade?.notify !== 'function') {
                    console.warn(`[dsh-upload-plugin] ${level}: ${text}`);
                    return;
                }
                facade.notify(level, text);
            };
            return createElement(AttachButtons, {
                sessionId: props.sessionId,
                input: props.input,
                store,
                sessions,
                notify,
            });
        }));
    });
    // Task 6 — the rail rides the live draft. This block binds the ONE record index
    // (the store above) so the rail and the command path resolve the same records
    // the buttons write, and registers the entry that re-renders the rail whenever
    // the composer's InputZone share changes. The entry renders nothing itself; the
    // rail is plain DOM inside the composer card.
    bindAttachmentStore(store);
    ctx.inject(['slots'], (scoped) => {
        const slots = scoped.get('slots');
        slots.inject('conversation.input.right', () => slots.register({
            name: 'conversation.input.right',
            id: 'vision-rail',
            order: 11,
        }, AttachmentRailEntry));
    });
}
