import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The composer's reasoning-effort control.
 *
 * It registers into `conversation.input.right`, so it renders to the LEFT of the
 * model seat — the model seat itself is left to the harness's shipped selector,
 * which owns the model list, its failure states and its retry.
 *
 * The menu is built from the Host's per-model effort vocabulary
 * (`model.reasoning.efforts`) plus one Custom row, so it can never offer a level
 * the Host would reject. A model that declares no reasoning renders nothing.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconChevronDownOutline14, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import { effortChoices, effortLabel } from '../effort.js';
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
export function EffortControl({ available, directory, load, select, onError }) {
    const [snapshot, setSnapshot] = useState(() => directory.getSnapshot());
    const [open, setOpen] = useState(false);
    const [customOpen, setCustomOpen] = useState(false);
    const [customValue, setCustomValue] = useState('');
    const [toast, setToast] = useState(null);
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
    const choices = useMemo(() => effortChoices(reasoning, current?.reasoningEffort), [reasoning, current?.reasoningEffort]);
    if (!available)
        return null;
    if (reasoning === undefined)
        return null;
    /**
     * A rejected selection: announce it, and keep the diagnostic channel.
     *
     * The Host's own text is read from the directory at settle time, not from this
     * render's snapshot: `select()` clears `error` when it starts and writes the
     * failure through the store, so a snapshot captured when the click's render ran
     * still holds the pre-click value and would lose the message to the fallback.
     * @param accepted - whether the directory took the selection.
     */
    const settle = (accepted) => {
        if (accepted) {
            setOpen(false);
            setCustomOpen(false);
            return;
        }
        const message = directory.getSnapshot().error ?? 'Không đổi được model';
        onError(message);
        // A fresh seq per show: the Toast restarts its own cycle by being remounted.
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text: message });
    };
    const chooseEffort = (effort) => {
        if (current === null || effort === undefined)
            return;
        // Re-apply the SAME route with the new level: only `reasoningEffort` changes,
        // so the provider and model come from the session's current selection.
        void select({ provider: current.provider, model: current.model, reasoningEffort: effort }).then(settle);
    };
    return (_jsxs("div", { ref: rootRef, style: ROOT_STYLE, children: [_jsxs(Button, { variant: "toolbar", size: "sm", "aria-haspopup": "menu", "aria-expanded": open, title: "M\u1EE9c suy lu\u1EADn", onClick: () => { setOpen(!open); setCustomOpen(false); }, children: [effortLabel(reasoning, current?.reasoningEffort) ?? '—', _jsx(IconChevronDownOutline14, { size: 14 })] }), open && (_jsxs("div", { role: "menu", style: MENU_STYLE, children: [choices.filter(choice => !choice.custom).map(choice => (_jsx(Button, { variant: "ghost", size: "sm", style: ROW_STYLE, role: "menuitemradio", "aria-checked": choice.selected, disabled: snapshot.status === 'selecting', onClick: () => { chooseEffort(choice.effort); }, children: choice.label }, choice.key))), _jsx(Button, { variant: "ghost", size: "sm", style: ROW_STYLE, onClick: () => { setCustomOpen(true); }, children: "Custom\u2026" }), customOpen && (_jsxs("form", { style: { display: 'flex', gap: 4, padding: 4 }, onSubmit: (event) => {
                            event.preventDefault();
                            // The submitted effort is the raw trimmed string, and an empty
                            // result means nothing was chosen — never a bare ''.
                            const value = customValue.trim();
                            if (value !== '')
                                chooseEffort(value);
                        }, children: [_jsx("input", { value: customValue, onChange: event => { setCustomValue(event.target.value); }, placeholder: "reasoning effort", "aria-label": "Custom reasoning effort" }), _jsx(Button, { variant: "ghost", size: "sm", type: "submit", children: "OK" })] }))] })), toast !== null && (_jsx(Toast, { text: toast.text, anchor: rootRef.current?.closest('[data-composer-card]') ?? null, onDone: () => { setToast(null); } }, toast.seq))] }));
}
