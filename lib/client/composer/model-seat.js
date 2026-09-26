import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The composer's model seat, taken over so the effort control can sit to the
 * right of the model name.
 *
 * `conversation.input.model` is a `single` slot: taking it means rendering the
 * whole model affordance, so this component re-implements the shipped selector's
 * observable behaviour (provider-grouped list, loading / whole-request error /
 * per-provider failure states with a retry, locked, subagent exclusion, a
 * transient toast on rejection) and adds the effort half.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import { effortChoices, effortLabel } from '../effort.js';
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
export function ModelSeat({ locked, available, directory, load, select, onError }) {
    const [snapshot, setSnapshot] = useState(() => directory.getSnapshot());
    const [open, setOpen] = useState('none');
    const [customOpen, setCustomOpen] = useState(false);
    const [customValue, setCustomValue] = useState('');
    const [toast, setToast] = useState(null);
    const toastSeq = useRef(0);
    const rootRef = useRef(null);
    /**
     * Which operation the directory's error text belongs to. A rejected SELECTION
     * writes `error` and leaves it set, so a retry that ran `load()` would clear the
     * strip and read as recovery while the selection was never applied. The shipped
     * selector guards the same way (`ModelSelect.tsx:59,274`).
     */
    const lastActionRef = useRef('load');
    useEffect(() => directory.subscribe(() => { setSnapshot(directory.getSnapshot()); }), [directory]);
    useEffect(() => {
        if (!available)
            return;
        lastActionRef.current = 'load';
        load();
    }, [available, load]);
    useEffect(() => {
        if (open === 'none')
            return;
        const closeOutside = (event) => {
            if (!rootRef.current?.contains(event.target)) {
                setOpen('none');
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
            setOpen('none');
            setCustomOpen(false);
            return;
        }
        const message = directory.getSnapshot().error ?? 'Không đổi được model';
        onError(message);
        // A fresh seq per show: the Toast restarts its own cycle by being remounted.
        toastSeq.current += 1;
        setToast({ seq: toastSeq.current, text: message });
    };
    const submit = (selection) => {
        lastActionRef.current = 'select';
        void select(selection).then(settle);
    };
    /** Re-run the catalog load — the only retry the failure strip may offer. */
    const reload = () => {
        lastActionRef.current = 'load';
        load();
    };
    const chooseEffort = (effort) => {
        if (current === null || effort === undefined)
            return;
        submit({ provider: current.provider, model: current.model, reasoningEffort: effort });
    };
    return (_jsxs("div", { ref: rootRef, style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("button", { type: "button", disabled: locked, "aria-haspopup": "menu", "aria-expanded": open === 'model', onClick: () => { setOpen(open === 'model' ? 'none' : 'model'); setCustomOpen(false); }, children: currentModel?.name ?? 'Chọn model' }), reasoning !== undefined && (_jsx("button", { type: "button", disabled: locked, "aria-haspopup": "menu", "aria-expanded": open === 'effort', onClick: () => { setOpen(open === 'effort' ? 'none' : 'effort'); setCustomOpen(false); }, children: effortLabel(reasoning, current?.reasoningEffort) ?? '—' })), open === 'model' && (_jsxs("div", { role: "menu", children: [snapshot.status === 'loading' && _jsx("div", { children: "\u0110ang t\u1EA3i\u2026" }), ((snapshot.error !== null && lastActionRef.current === 'load') || snapshot.failures.length > 0) && (_jsxs("div", { children: [snapshot.error !== null && lastActionRef.current === 'load' && _jsx("span", { children: snapshot.error }), snapshot.failures.map(failure => (_jsx("div", { children: _jsx("span", { children: `${failure.name} tải thất bại: ${failure.message}` }) }, failure.id))), _jsx("button", { type: "button", onClick: reload, children: "Th\u1EED l\u1EA1i" })] })), snapshot.groups.map(group => (_jsxs("section", { children: [_jsx("div", { children: group.name }), group.models.map(model => (_jsx("button", { type: "button", role: "menuitemradio", "aria-checked": current?.provider === group.id && current.model === model.id, disabled: snapshot.status === 'selecting', onClick: () => { submit({ provider: group.id, model: model.id }); }, children: model.name }, model.id)))] }, group.id)))] })), open === 'effort' && (_jsxs("div", { role: "menu", children: [choices.filter(choice => !choice.custom).map(choice => (_jsx("button", { type: "button", role: "menuitemradio", "aria-checked": choice.selected, disabled: snapshot.status === 'selecting', onClick: () => { chooseEffort(choice.effort); }, children: choice.label }, choice.key))), _jsx("button", { type: "button", onClick: () => { setCustomOpen(true); }, children: "Custom\u2026" }), customOpen && (_jsxs("form", { onSubmit: (event) => {
                            event.preventDefault();
                            // The submitted effort is the raw trimmed string, and an empty
                            // result means nothing was chosen — never a bare ''.
                            const value = customValue.trim();
                            if (value !== '')
                                chooseEffort(value);
                        }, children: [_jsx("input", { value: customValue, onChange: event => { setCustomValue(event.target.value); }, placeholder: "reasoning effort", "aria-label": "Custom reasoning effort" }), _jsx("button", { type: "submit", children: "OK" })] }))] })), toast !== null && (_jsx(Toast, { text: toast.text, anchor: rootRef.current?.closest('[data-composer-card]') ?? null, onDone: () => { setToast(null); } }, toast.seq))] }));
}
