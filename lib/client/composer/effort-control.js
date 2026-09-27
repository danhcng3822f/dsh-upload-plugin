import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The composer's reasoning-effort control.
 *
 * It registers into `conversation.input.right`, so it renders to the LEFT of the
 * model seat — the model seat itself is left to the harness's shipped selector,
 * which owns the model list, its failure states and its retry.
 *
 * The menu is built from the Host's per-model effort vocabulary
 * (`model.reasoning.efforts`) plus one Custom row. A model the Host reports no
 * reasoning for has no vocabulary to build from — but that alone does not decide
 * whether a control is possible, because a model served by the installed catalog
 * also reports nothing until it is declared. So the control reads the settings
 * document for the model's own row and renders only when the row declares
 * nothing either: the conjunction of "nothing reported" and "nothing declared" is
 * the one state where a declaration can be written without restating a level
 * whose wire spelling belongs to the catalog. That menu offers the level names a
 * first declaration may name, and picking one declares it and then selects it.
 *
 * Custom… names a level the model does not offer yet. That is only meaningful
 * because the model's *declaration* is its whole offer
 * (`llm-pi-ai/src/catalog.ts:359-368`), so Custom adds the level to the
 * declaration through the settings document the Settings → Vision page edits and
 * then selects it — never the other way round, and never a value the declaration
 * schema would refuse. `../reasoning-setting.js` decides which of those cases a
 * typed value is; this component only carries the decision out and says what
 * happened.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconChevronDownOutline14, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import { effortChoices, effortLabel, firstDeclarationChoices, isDeclarableLevel, reportsEfforts, } from '../effort.js';
import { hasEffortDeclaration, planDeclaration, planTypedEffort } from '../reasoning-setting.js';
import { messageOf, providerModels, SETTINGS_NAMESPACE } from '../settings/document.js';
/**
 * The trigger and its menu, styled from the shell's own tokens so the control
 * reads as part of the composer rather than beside it.
 *
 * A bare `<button>` takes the browser's default fill and border, which is what
 * made this plugin's controls look foreign; `Button` supplies the
 * `--dsw-alias-button-*` chrome instead. The menu card copies the geometry the
 * shell's `Menu` primitive uses for its own list — 12px radius, inverted
 * hairline, `--dsw-specific-menu` fill, `--dsw-shadow-lv3` — and opens upward
 * because the composer sits at the bottom of the viewport.
 */
const ROOT_STYLE = { position: 'relative', display: 'inline-flex', alignItems: 'center' };
const MENU_STYLE = {
    position: 'absolute',
    bottom: 'calc(100% + 4px)',
    left: 0,
    zIndex: 20,
    minWidth: 160,
    padding: 4,
    border: '1px solid var(--dsw-alias-border-inverted)',
    borderRadius: 12,
    background: 'var(--dsw-specific-menu)',
    boxShadow: 'var(--dsw-shadow-lv3)',
};
const ROW_STYLE = { width: '100%', justifyContent: 'flex-start' };
/** The past-tense verb each kind of write is reported with. */
const WRITE_VERB = { extension: 'thêm', first: 'khai báo' };
/**
 * The model's reasoning metadata, only when it carries the effort catalog.
 *
 * The directory's data is the Host's, so a `reasoning` object can arrive without
 * the `efforts` array `ReasoningInfo` declares — and both `effortChoices` and
 * `effortLabel` read `reasoning.efforts` unguarded (`effort.ts:36`, `:54`), which
 * would throw mid-render. Normalizing here keeps `effort.ts` untouched and makes
 * such a value behave exactly like no reasoning declared at all.
 * @param reasoning - the resolved model's reasoning share, as the directory publishes it.
 * @returns the metadata when it declares an effort catalog, else undefined.
 */
function usableReasoning(reasoning) {
    if (reasoning === undefined || !Array.isArray(reasoning.efforts))
        return undefined;
    return reasoning;
}
export function EffortControl({ available, directory, load, select, settings, onError }) {
    const [snapshot, setSnapshot] = useState(() => directory.getSnapshot());
    const [open, setOpen] = useState(false);
    const [customOpen, setCustomOpen] = useState(false);
    const [customValue, setCustomValue] = useState('');
    // True while a level is being declared, from Custom… or from a row of the
    // first-declaration menu. The write is a round trip, so the menu stays disabled
    // until it settles rather than accepting a second submit against a revision the
    // first one is about to supersede.
    const [declaring, setDeclaring] = useState(false);
    const [toast, setToast] = useState(null);
    /**
     * The settings-document half of the trigger, for the route it was read for.
     *
     * `null` covers every state in which the row's declaration was not positively
     * read — not read yet, a failed read, a route the document does not describe,
     * or a route that carries no row for this model. All of them keep the control
     * hidden, which is the only safe answer: without the document the two
     * conditions cannot be told apart, and guessing would declare levels over a
     * catalog's spellings.
     */
    const [declaration, setDeclaration] = useState(null);
    const toastSeq = useRef(0);
    const rootRef = useRef(null);
    useEffect(() => directory.subscribe(() => { setSnapshot(directory.getSnapshot()); }), [directory]);
    /**
     * Load the catalog on mount. This component reads the current model's reasoning
     * out of the same directory the shipped selector reads, and that directory does
     * not fetch on its own — the selector loads it when its menu opens. Without this
     * the control would render nothing until the user happened to open the model
     * menu first.
     */
    useEffect(() => {
        if (!available)
            return;
        load();
    }, [available, load]);
    useEffect(() => {
        if (!open)
            return;
        const closeOutside = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setOpen(false);
                setCustomOpen(false);
            }
        };
        document.addEventListener('mousedown', closeOutside);
        return () => { document.removeEventListener('mousedown', closeOutside); };
    }, [open]);
    const current = snapshot.current;
    const currentModel = useMemo(() => {
        if (current === null)
            return undefined;
        for (const group of snapshot.groups) {
            for (const model of group.models) {
                if (group.id === current.provider && model.id === current.model)
                    return model;
            }
        }
        return undefined;
    }, [snapshot.groups, current]);
    const reasoning = usableReasoning(currentModel?.reasoning);
    /**
     * The first half of the conjunction: does the Host publish any level at all?
     *
     * Read from the directory, which is the Host's own answer. `false` is what
     * sends the control to the settings document below, and `true` keeps it away
     * from there entirely — a model that reports levels needs no read.
     */
    const hostReports = reportsEfforts(reasoning);
    const provider = current?.provider;
    const model = current?.model;
    /**
     * Read the model's own row for the second half — whether it declares
     * `reasoningEfforts` — and only when the first half says the answer matters.
     *
     * This is the read R28 already reaches the document with, through the same
     * `providerModels`; no second reader is introduced. It runs once per route a
     * model switch lands on, and never for a model that reports levels.
     */
    useEffect(() => {
        if (!available || hostReports || provider === undefined || model === undefined)
            return;
        let live = true;
        void (async () => {
            try {
                const described = await settings.describe({});
                if (!described.result.ok)
                    return;
                const view = described.result.value.namespaces.find(candidate => candidate.ns === SETTINGS_NAMESPACE);
                if (view === undefined)
                    return;
                const row = providerModels(view.value, provider)?.find(candidate => candidate.id === model);
                // A route the document does not describe, or a route with no row for this
                // model, leaves the state unread: `planDeclaration` would refuse such a
                // write, so offering the menu for it would be a control that cannot act.
                if (row === undefined || !live)
                    return;
                setDeclaration({ provider, model, declared: hasEffortDeclaration(row) });
            }
            catch {
                // Left unread on purpose: the control stays hidden rather than declaring
                // levels on a model whose spellings could not be checked.
            }
        })();
        return () => { live = false; };
    }, [available, hostReports, provider, model, settings]);
    /**
     * Both halves, together: the Host reports no level AND the row declares none.
     *
     * Only this state may write a first declaration. A row that declares something
     * is left alone even when the Host reports nothing (a `reasoningEfforts: false`
     * row, or one whose route is not currently serving), and a model the Host
     * reports levels for never reaches here at all — that is what keeps a
     * catalog-served model's spellings out of the write path.
     */
    const firstDeclaration = !hostReports && current !== null && declaration !== null
        && declaration.provider === current.provider && declaration.model === current.model
        && !declaration.declared;
    const choices = useMemo(() => hostReports ? effortChoices(reasoning, current?.reasoningEffort) : firstDeclarationChoices(), [hostReports, reasoning, current?.reasoningEffort]);
    // The model's offered level ids, which is the vocabulary Custom… is measured
    // against: a level already in this list needs no declaration.
    const offered = useMemo(() => reasoning?.efforts.map(effort => effort.id) ?? [], [reasoning]);
    if (!available)
        return null;
    if (!hostReports && !firstDeclaration)
        return null;
    /**
     * Say something to the user, and keep the diagnostic channel fed.
     *
     * Both channels carry every outcome this control reports — a refusal, a failed
     * write, a failed selection — because they are two different readers of one
     * fact: the banner is what the person who typed the value needs, and `onError`
     * is what a console-only session has instead.
     * @param message - the resolved text.
     */
    const report = (message) => {
        onError(message);
        // A fresh seq per show: the Toast restarts its own cycle by being remounted.
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text: message });
    };
    /**
     * A rejected selection: announce it, and keep the diagnostic channel.
     *
     * The Host's own text is read from the directory at settle time, not from this
     * render's snapshot: `select()` clears `error` when it starts and writes the
     * failure through the store, so a snapshot captured when the click's render ran
     * still holds the pre-click value and would lose the message to the fallback.
     * @param accepted - whether the directory took the selection.
     * @param prefix - what else already happened, when the selection is the second
     * half of a larger action: a bare failure would read as if nothing had changed.
     */
    const settle = (accepted, prefix) => {
        if (accepted) {
            setOpen(false);
            setCustomOpen(false);
            return;
        }
        const message = directory.getSnapshot().error ?? 'Không đổi được model';
        report(prefix === undefined ? message : `${prefix} ${message}`);
    };
    /**
     * Re-apply the SAME route with a level: only `reasoningEffort` changes, so the
     * provider and model come from the session's current selection.
     * @param effort - the level to select.
     * @param written - the kind of declaration this control wrote moments ago, or
     * undefined when the level was already offered. Its presence is also what says
     * the directory this menu renders from still lacks the level, so the menu is
     * reloaded once the selection lands.
     */
    const chooseEffort = (effort, written) => {
        if (current === null || effort === undefined)
            return;
        void select({ provider: current.provider, model: current.model, reasoningEffort: effort }).then((accepted) => {
            settle(accepted, written === undefined
                ? undefined
                : `Đã ${WRITE_VERB[written]} mức "${effort}" nhưng chưa chọn được.`);
            // The menu's rows come from the directory, which the Host refreshed before
            // the declaration existed: without this the level would be selected and
            // named by the trigger, yet still absent from the list that offers it.
            if (accepted && written !== undefined)
                load();
        });
    };
    /**
     * Write a level into the model's declaration, then select it.
     *
     * Two writes reach here, and `planDeclaration` is handed the fact that tells
     * them apart. A level the model does not offer yet *extends* a declaration the
     * row already has — R28's path, reached from Custom… and from a row of the
     * Host's menu that the declaration somehow lacks. A level picked from the
     * first-declaration menu *creates* the declaration, which is only reachable
     * because the Host reported no levels for this model AND its row declares
     * none.
     *
     * The write goes through the same document the Settings → Vision page edits,
     * with the same revision discipline (`../settings/vision-section.tsx`): the
     * provider's `models` array is re-read immediately before it is replaced, so
     * the array written back is the one current NOW, and a genuinely concurrent
     * change is answered `settings-conflict` instead of being overwritten. The op
     * names one path — `providers.<provider>.models` — so no other provider and no
     * other field of this profile is restated, and `planDeclaration` has already
     * produced rows that keep every level and field they had.
     *
     * Selection happens only AFTER the write lands. The Host resolves an effort
     * against the model's declaration, so selecting a level it does not know yet
     * is exactly the failure this path exists to remove; a write that did not land
     * therefore ends here, with the failure reported and the session untouched.
     * @param level - the level to declare, already known to be in the vocabulary.
     */
    const declareEffort = async (level) => {
        if (current === null)
            return;
        const { provider, model } = current;
        // Which sentence a failure is reported with. Only the plan knows, and the
        // plan is read after the document is; a failure before that point has
        // nothing to say otherwise, so it is reported as an extension.
        let kind = 'extension';
        setDeclaring(true);
        try {
            const described = await settings.describe({});
            if (!described.result.ok) {
                report(`Không đọc được cấu hình model: ${described.result.error.message}`);
                return;
            }
            const view = described.result.value.namespaces.find(candidate => candidate.ns === SETTINGS_NAMESPACE);
            if (view === undefined) {
                report(`Không tìm thấy namespace "${SETTINGS_NAMESPACE}" trong cấu hình.`);
                return;
            }
            // `hostReports` is the other half of the conjunction: with it true, a row
            // that declares nothing is served by the installed catalog and the plan
            // refuses; with it false, that same row is the one a first declaration may
            // be written into.
            const plan = planDeclaration(level, providerModels(view.value, provider), model, hostReports);
            if (plan.kind === 'refuse') {
                report(plan.reason);
                return;
            }
            kind = plan.first ? 'first' : 'extension';
            const response = await settings.mutate({
                ns: SETTINGS_NAMESPACE,
                ops: [{ op: 'set', path: ['providers', provider, 'models'], value: plan.models }],
                expectedRevision: view.revision,
            });
            if (!response.result.ok) {
                report(response.result.error.code === 'settings-conflict'
                    ? `Cấu hình vừa bị thay đổi ở nơi khác nên chưa ${WRITE_VERB[kind]} được mức "${level}". Thử lại.`
                    : `Không ${WRITE_VERB[kind]} được mức "${level}": ${response.result.error.message}`);
                return;
            }
            report(`Đã ${WRITE_VERB[kind]} mức "${level}" cho model "${model}".`);
            chooseEffort(level, kind);
        }
        catch (err) {
            report(`Không ${WRITE_VERB[kind]} được mức "${level}": ${messageOf(err)}`);
        }
        finally {
            setDeclaring(false);
        }
    };
    /**
     * Carry out a menu row.
     *
     * A row of the Host's menu names a level the model offers, so it is selected.
     * A row of the first-declaration menu names a level the model does not offer
     * yet — it has no vocabulary at all — so it is declared first and selected
     * after, exactly as a typed Custom value would be.
     * @param choice - the row that was clicked.
     */
    const activate = (choice) => {
        if (hostReports) {
            chooseEffort(choice.effort);
            return;
        }
        // Every row of the first-declaration menu names a declarable level, so this
        // guard is a narrowing rather than a decision; a row that somehow names none
        // is left alone rather than declared blindly.
        if (choice.effort !== undefined && isDeclarableLevel(choice.effort))
            void declareEffort(choice.effort);
    };
    /**
     * Carry out what a typed Custom value means, in the order the cases require.
     *
     * An offered level is selected with no write at all; a value outside the seven
     * level names is refused here, in the menu where it was typed, instead of being
     * accepted and refused by the Host later; anything else is a declaration to
     * make first. A session with no current route cannot select anything, so it
     * must not write a declaration it could never act on.
     * @param typed - the trimmed text from the Custom row.
     */
    const submitCustom = (typed) => {
        if (current === null) {
            report('Chưa chọn được model cho phiên này.');
            return;
        }
        const plan = planTypedEffort(typed, offered);
        if (plan.kind === 'refuse') {
            report(plan.reason);
            return;
        }
        if (plan.kind === 'select') {
            chooseEffort(plan.effort);
            return;
        }
        void declareEffort(plan.level);
    };
    return (_jsxs("div", { ref: rootRef, style: ROOT_STYLE, children: [_jsxs(Button, { variant: "toolbar", size: "sm", "aria-haspopup": "menu", "aria-expanded": open, title: "M\u1EE9c suy lu\u1EADn", onClick: () => { setOpen(!open); setCustomOpen(false); }, children: [effortLabel(reasoning, current?.reasoningEffort) ?? '—', _jsx(IconChevronDownOutline14, { size: 14 })] }), open && (_jsxs("div", { role: "menu", style: MENU_STYLE, children: [choices.filter(choice => !choice.custom).map(choice => (_jsx(Button, { variant: "ghost", size: "sm", style: ROW_STYLE, role: "menuitemradio", "aria-checked": choice.selected, disabled: snapshot.status === 'selecting' || declaring, onClick: () => { activate(choice); }, children: choice.label }, choice.key))), hostReports && (_jsx(Button, { variant: "ghost", size: "sm", style: ROW_STYLE, disabled: snapshot.status === 'selecting' || declaring, onClick: () => { setCustomOpen(true); }, children: "Custom\u2026" })), hostReports && customOpen && (_jsxs("form", { style: { display: 'flex', gap: 4, padding: 4 }, onSubmit: (event) => {
                            event.preventDefault();
                            // The submitted effort is the raw trimmed string, and an empty
                            // result means nothing was chosen — never a bare ''.
                            const value = customValue.trim();
                            if (value !== '')
                                submitCustom(value);
                        }, children: [_jsx("input", { value: customValue, onChange: event => { setCustomValue(event.target.value); }, placeholder: "reasoning effort", "aria-label": "Custom reasoning effort", disabled: declaring }), _jsx(Button, { variant: "ghost", size: "sm", type: "submit", disabled: declaring, children: "OK" })] }))] })), toast !== null && (_jsx(Toast, { text: toast.text, anchor: rootRef.current?.closest('[data-composer-card]') ?? null, onDone: () => { setToast(null); } }, toast.seq))] }));
}
