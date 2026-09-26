import { createElement } from 'react';
import { AttachmentStore } from './attachment-store.js';
import { AttachmentRailEntry, bindAttachmentStore } from './attachment-bar.js';
import { AttachButtons } from './composer/attach-buttons.js';
import { EffortControl } from './composer/effort-control.js';
import { registerVisionCommands } from './commands.js';
import { createVisionSource } from './reference.js';
import { VisionSection, NAMESPACE as VISION_NAMESPACE } from './settings/vision-section.js';
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
                const facade = actx === undefined ? undefined : conversation?.input?.for?.(actx);
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
    // R23 — the reasoning-effort control, and NOT the model seat.
    //
    // An earlier revision took `conversation.input.model` over at `priority: -1` so
    // the effort control could sit to the model's right. The user reversed that
    // after trying it: a `single` slot means rendering the whole model affordance,
    // so owning it replaced the shipped selector and with it the behaviours that
    // selector already had (its `▾`, per-provider failure rows with a retry,
    // keyboard handling, reload-on-open). The seat is therefore left alone, and
    // this registers into `conversation.input.right` beside the attach buttons and
    // the rail — which places the effort control to the LEFT of the model seat.
    // That position is the accepted cost of getting the shipped selector back.
    ctx.inject(['slots', 'sessions', 'modelDirectories'], (scoped) => {
        const slots = scoped.get('slots');
        const sessions = scoped.get('sessions');
        const directories = scoped.get('modelDirectories');
        slots.inject('conversation.input.right', () => slots.register({
            name: 'conversation.input.right',
            id: 'vision-effort',
            order: 12,
            // The render machinery memoizes an entry's inject face per entry x session
            // scope (web-react `scoped-slots.tsx`, sessionInjectCache), so `load` and
            // `select` keep their identity across re-renders and the control's mount
            // effect fires once per session. Built inline in a render callback
            // instead, `load` would be a fresh function on every composer render and
            // that effect would re-issue `session.models` on every keystroke.
            inject: (sessionId) => {
                const available = sessions?.subagentAddress?.(sessionId) === undefined;
                const directory = directories.directoryFor(sessionId);
                return {
                    available,
                    directory: directory.store,
                    load: () => { if (available)
                        directory.load().catch(() => { }); },
                    select: (selection) => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
                    onError: (message) => { console.warn('[dsh-upload-plugin] effort control:', message); },
                };
            },
        }, EffortControl));
    });
    // Task 10 — the plugin's own settings page, one toggle per model. `settings.section`
    // is a root-scoped list, so the registration carries the nav identity (`id` keys the
    // shell's `only` filter, `order` positions the row) and a `label` thunk, matching the
    // shipped `models` entry (`ui-settings-models/src/client/index.ts:118`).
    //
    // The brief writes the element inline as JSX in a render callback; `index.ts` is a
    // `.ts` file, which the TypeScript parser refuses to read as JSX (TS1005), so the
    // component is handed to the registry and the wire face arrives through the `inject`
    // face instead — Task 8's route. The face thunk may run more than once, but it only
    // ever hands over the connection's own stable `api`, which is the identity the
    // section's `load` effect depends on.
    ctx.inject(['slots', 'connection', 'remote'], (scoped) => {
        const slots = scoped.get('slots');
        const connection = scoped.get('connection');
        // `remote` is not declared on this package's `Context`, so it is reached the
        // way every other service here is; the cast is the same one the shipped
        // settings scope uses (`ui-settings/src/client/settings-scope.ts:259`).
        const remote = scoped.get('remote');
        // Pushed invalidation, in the shipped models page's own shape
        // (`ui-settings-models/src/client/index.ts:100-116`): `settings/document-updated`
        // carries the namespace whose document changed, and a mounted page re-reads
        // it. The page registers its own reload, so the set is empty — and nothing
        // happens — while no page is mounted.
        const reloaders = new Set();
        scoped.effect(() => {
            const dispose = remote.$on('settings/document-updated', (ns) => {
                if (ns !== VISION_NAMESPACE)
                    return;
                for (const reload of reloaders)
                    reload();
            });
            return () => { dispose(); reloaders.clear(); };
        }, 'dsh-upload-plugin: vision settings document invalidations');
        slots.inject('settings.section', () => slots.register({
            name: 'settings.section',
            id: 'vision',
            order: 20,
            label: () => 'Vision',
            // Annotated with the component's own props type on purpose: `slots` is
            // `any` (the harness's `SlotCore`/`SlotMap` types are not installable in
            // this package — see the note in `platform-modules.d.ts`), so without this
            // nothing checks that the face this entry hands over is the face the
            // section reads.
            inject: () => ({
                api: connection.api,
                onDocumentUpdated: (reload) => {
                    reloaders.add(reload);
                    return () => { reloaders.delete(reload); };
                },
            }),
        }, VisionSection));
    });
}
