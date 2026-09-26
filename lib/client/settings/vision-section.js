import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * The plugin's own settings page: one toggle per model, controlling whether the
 * model declares image input.
 *
 * This states a declaration only — it never probes whether an upstream really
 * serves images. The shipped Models page owns provider topology; this page owns
 * exactly one field of one row and preserves everything else.
 *
 * Wire shape, read out of the harness rather than assumed. The read is
 * `settings.describe({})`, whose `result.value` carries `writable` plus one
 * redacted view per namespace; the write is
 * `settings.mutate({ ns, ops, expectedRevision })` — the path-addressed edit the
 * shipped Models page itself uses for profile changes
 * (`ui-settings-models/src/client/CustomProviderCard.tsx:147`), typed in
 * `host/apiproxy/src/fetch/client.ts:152` and served at
 * `host/apiproxy/src/fetch/handler.ts:136`. There is no
 * `settings.read(ns)`/`settings.write(ns, value)` verb.
 *
 * The one op writes a whole provider's `models` array rather than a path inside
 * one row, because `applyPathOp` (`settings/settings/src/index.ts:205`) treats
 * any non-plain-object child as a leaf: an index path such as
 * `providers.<id>.models.0.input` walks into the ARRAY, finds it is not a plain
 * object, and replaces it with an object keyed by `"0"`. `models` is the
 * deepest addressable node.
 */
import { useCallback, useEffect, useState } from 'react';
import { hasVision, setVision } from '../vision-setting.js';
/** The settings namespace holding pi-ai provider profiles. */
const NAMESPACE = 'llm-pi-ai';
/**
 * Human text for a rejected wire call. A transport failure rejects with an
 * `Error`; a host or a runtime can reject with anything, and the page still has
 * to say something. (Same helper as the shipped Models store.)
 * @param error - the rejection value.
 * @returns the message to show.
 */
function messageOf(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * The document is hand-editable, so a model entry is only trusted to be an
 * object. This predicate deliberately does NOT claim an `id`: `ModelRow.id` is
 * required by the type and enforced by nothing at runtime, which is what
 * {@link isAddressable} exists for.
 * @param row - one entry of a profile's `models` array.
 * @returns whether the entry is an object this page can read fields from.
 */
function isRowObject(row) {
    return typeof row === 'object' && row !== null && !Array.isArray(row);
}
/**
 * Whether a row can be toggled at all: `setVision` addresses a row by `id`, so a
 * row without a usable one cannot be named — and `setVision` would flip EVERY
 * id-less row at once, since `undefined !== undefined` is false.
 * @param row - one model entry.
 * @returns whether the row carries a usable id.
 */
function isAddressable(row) {
    return typeof row.id === 'string' && row.id.length > 0;
}
/**
 * Read the provider dict out of a namespace value, keeping each profile's own
 * fields untouched: the page renders `displayName` and `models` and passes the
 * rows to `setVision` verbatim, so nothing here normalizes or drops a field.
 * @param value - the namespace's resolved value (`Config` of `llm-pi-ai`).
 * @returns one row per declared provider, or an empty list when none are.
 */
function readProviders(value) {
    if (typeof value !== 'object' || value === null)
        return [];
    const providers = value.providers;
    if (typeof providers !== 'object' || providers === null || Array.isArray(providers))
        return [];
    return Object.entries(providers).map(([id, profile]) => {
        const fields = typeof profile === 'object' && profile !== null && !Array.isArray(profile)
            ? profile
            : {};
        return {
            id,
            displayName: typeof fields.displayName === 'string' ? fields.displayName : undefined,
            models: Array.isArray(fields.models) ? fields.models.filter(isRowObject) : [],
        };
    });
}
export function VisionSection({ api }) {
    const [providers, setProviders] = useState([]);
    const [writable, setWritable] = useState(false);
    // Two failure channels, because they are two different facts. A read failure
    // means the page has nothing to show, so it replaces the page and offers a
    // retry. A write failure touched one row: it leaves the list and every
    // checkbox standing and is reported beside them, because replacing the page
    // would announce a read that never failed and destroy the context the user
    // needs to act on the failure.
    const [loadError, setLoadError] = useState(null);
    const [writeError, setWriteError] = useState(null);
    const [busy, setBusy] = useState(false);
    // Nothing about the host's posture is known before the first describe lands,
    // so the page must not state one: `writable` defaults to false and the
    // provider list starts empty, and both would otherwise be reported as fact.
    const [loading, setLoading] = useState(true);
    /**
     * Refresh the whole page from the host. `api` is the connection's own stable
     * `IApiClient`, so this callback keeps its identity across renders and the
     * mount effect below runs once — a settings page must not re-read the
     * document on every render.
     *
     * Every failure here is a READ failure and reports through `loadError`, the
     * only channel that replaces the page.
     */
    const load = useCallback(async () => {
        try {
            const response = await api.settings.describe({});
            if (!response.result.ok) {
                setLoadError(response.result.error.message);
                return;
            }
            const view = response.result.value.namespaces.find(candidate => candidate.ns === NAMESPACE);
            if (view === undefined) {
                setProviders([]);
                setWritable(false);
                setLoadError(`Không tìm thấy namespace "${NAMESPACE}"`);
                return;
            }
            setProviders(readProviders(view.value));
            setWritable(response.result.value.writable);
            setLoadError(null);
        }
        catch (err) {
            setLoadError(messageOf(err));
        }
        finally {
            setLoading(false);
        }
    }, [api]);
    useEffect(() => { void load(); }, [load]);
    /**
     * Flip one row's image declaration and write the provider's whole `models`
     * array back.
     *
     * The document is re-read here rather than reused from state: the array being
     * replaced has to be the one current NOW, or a stale snapshot would revert a
     * change made elsewhere. The same read supplies the revision, so a genuinely
     * concurrent write is answered `settings-conflict` instead of being
     * overwritten — the shipped Models card passes `expectedRevision` for exactly
     * this reason (`CustomProviderCard.tsx:150-153`).
     *
     * The write names one path, `providers.<id>.models`, so no other provider and
     * no other field of this profile is restated. A profile that resolves only
     * from a base layer does materialize its `models` array into the user layer;
     * that is the only node the op names, and the resolved result is unchanged.
     *
     * Every failure on this path — including the re-read above and the reload
     * after a successful write — reports through `writeError`: from the user's
     * side a checkbox was clicked and did not take, and the page they need to see
     * that against stays mounted.
     * @param providerId - the provider route id (the `providers` dict key).
     * @param modelId - the row to change, matched by `setVision`.
     * @param on - true declares `["text","image"]`, false removes the `input` key.
     */
    const toggle = useCallback(async (providerId, modelId, on) => {
        setBusy(true);
        try {
            const described = await api.settings.describe({});
            if (!described.result.ok) {
                setWriteError(described.result.error.message);
                return;
            }
            const view = described.result.value.namespaces.find(candidate => candidate.ns === NAMESPACE);
            const provider = view === undefined
                ? undefined
                : readProviders(view.value).find(row => row.id === providerId);
            if (view === undefined || provider === undefined) {
                setWriteError(`Không tìm thấy provider "${providerId}" trong "${NAMESPACE}"`);
                return;
            }
            const response = await api.settings.mutate({
                ns: NAMESPACE,
                ops: [{
                        op: 'set',
                        path: ['providers', providerId, 'models'],
                        value: setVision(provider.models, modelId, on),
                    }],
                expectedRevision: view.revision,
            });
            if (!response.result.ok) {
                setWriteError(response.result.error.code === 'settings-conflict'
                    ? 'Cấu hình vừa bị thay đổi ở nơi khác. Thử lại.'
                    : response.result.error.message);
                return;
            }
            // The write landed; the note belongs to the previous attempt.
            setWriteError(null);
            await load();
        }
        catch (err) {
            setWriteError(messageOf(err));
        }
        finally {
            setBusy(false);
        }
    }, [api, load]);
    if (loadError !== null) {
        return (_jsxs("div", { children: [_jsxs("p", { children: ["Kh\u00F4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c c\u1EA5u h\u00ECnh model: ", loadError] }), _jsx("button", { type: "button", onClick: () => { void load(); }, children: "Th\u1EED l\u1EA1i" })] }));
    }
    const total = providers.reduce((sum, provider) => sum + provider.models.length, 0);
    // A route that declares no `models` serves the installed catalog and has no
    // row this page can state anything about, so it draws no section at all
    // rather than an empty heading.
    const declared = providers.filter(provider => provider.models.length > 0);
    return (_jsxs("div", { children: [_jsxs("p", { children: ["B\u1EADt/t\u1EAFt kh\u1EA3 n\u0103ng \u0111\u1ECDc \u1EA3nh cho t\u1EEBng model. B\u1EADt s\u1EBD khai b\u00E1o ", _jsx("code", { children: "input: [\"text\",\"image\"]" }), "."] }), loading && _jsx("p", { children: "\u0110ang t\u1EA3i\u2026" }), !loading && !writable && _jsx("p", { children: "C\u1EA5u h\u00ECnh hi\u1EC7n ch\u1EC9 cho \u0111\u1ECDc n\u00EAn kh\u00F4ng l\u01B0u \u0111\u01B0\u1EE3c thay \u0111\u1ED5i." }), !loading && total === 0 && _jsxs("p", { children: ["Ch\u01B0a c\u00F3 provider n\u00E0o khai b\u00E1o model trong ", _jsx("code", { children: NAMESPACE }), "."] }), writeError !== null && _jsxs("p", { children: ["Kh\u00F4ng c\u1EADp nh\u1EADt \u0111\u01B0\u1EE3c c\u1EA5u h\u00ECnh model: ", writeError] }), declared.map(provider => {
                const rows = provider.models.filter(isAddressable);
                const skipped = provider.models.length - rows.length;
                return (_jsxs("section", { children: [_jsx("h3", { children: provider.displayName ?? provider.id }), rows.map((model, index) => (
                        // The key pairs the row's position with its id: `setVision` flips
                        // every row whose id matches, so a malformed document may hold
                        // duplicate ids and the position is what stays unique.
                        _jsxs("label", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("input", { type: "checkbox", checked: hasVision(model), disabled: busy || !writable, onChange: event => { void toggle(provider.id, model.id, event.target.checked); } }), _jsx("span", { children: model.name ?? model.id })] }, `${model.id}#${String(index)}`))), skipped > 0 && _jsxs("p", { children: [skipped, " model thi\u1EBFu id n\u00EAn b\u1ECF qua."] })] }, provider.id));
            })] }));
}
