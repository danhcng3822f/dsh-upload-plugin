/**
 * The plugin's own settings page: one toggle per model, controlling whether the
 * model declares image input.
 *
 * This states a declaration only — it never probes whether an upstream really
 * serves images. The shipped Models page owns provider topology; this page owns
 * exactly one field of one row and preserves everything else.
 *
 * The wire envelope, the namespace and the provider-row read come from
 * `./document.js`, which the composer's effort control edits the same document
 * through; the path-addressed edit both use is documented there.
 */
import { useCallback, useEffect, useState } from 'react'
import { hasVision, setVision, type ModelRow } from '../vision-setting.js'
import { messageOf, readProviders, SETTINGS_NAMESPACE, type ProviderRow, type SettingsApi } from './document.js'

/** The subset of the connection's wire face this page calls. */
export interface VisionSectionApi {
  settings: SettingsApi
}

/**
 * Whether a row can be toggled at all: `setVision` addresses a row by `id`, so a
 * row without a usable one cannot be named — and `setVision` would flip EVERY
 * id-less row at once, since `undefined !== undefined` is false.
 * @param row - one model entry.
 * @returns whether the row carries a usable id.
 */
function isAddressable(row: ModelRow): boolean {
  return typeof row.id === 'string' && row.id.length > 0
}

export interface VisionSectionProps {
  api: VisionSectionApi
  /**
   * Register the page's reload with the plugin's `settings/document-updated`
   * subscription, which fires when the document changes somewhere else (the
   * shipped Models page, another tab, a hand edit). Returns the disposer.
   * @param reload - called with no arguments when the document changed.
   * @returns the unsubscribe function.
   */
  onDocumentUpdated(reload: () => void): () => void
}

export function VisionSection({ api, onDocumentUpdated }: VisionSectionProps) {
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [writable, setWritable] = useState(false)
  // Two failure channels, because they are two different facts. A read failure
  // means the page has nothing to show, so it replaces the page and offers a
  // retry. A write failure touched one row: it leaves the list and every
  // checkbox standing and is reported beside them, because replacing the page
  // would announce a read that never failed and destroy the context the user
  // needs to act on the failure.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Nothing about the host's posture is known before the first describe lands,
  // so the page must not state one: `writable` defaults to false and the
  // provider list starts empty, and both would otherwise be reported as fact.
  const [loading, setLoading] = useState(true)

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
      const response = await api.settings.describe({})
      if (!response.result.ok) {
        setLoadError(response.result.error.message)
        return
      }
      const view = response.result.value.namespaces.find(candidate => candidate.ns === SETTINGS_NAMESPACE)
      if (view === undefined) {
        setProviders([])
        setWritable(false)
        setLoadError(`Không tìm thấy namespace "${SETTINGS_NAMESPACE}"`)
        return
      }
      setProviders(readProviders(view.value))
      setWritable(response.result.value.writable)
      setLoadError(null)
    } catch (err) {
      setLoadError(messageOf(err))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  // Stay fresh while the page is mounted: the document can also change from the
  // shipped Models page, another tab, or a hand edit, and this page renders a
  // document it does not own. The push subscription itself lives in the plugin
  // entry; this only hands it the reload.
  useEffect(() => onDocumentUpdated(() => { void load() }), [onDocumentUpdated, load])

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
   * Every failure the WRITE reports — the re-read above, and the write itself —
   * goes through `writeError`: from the user's side a checkbox was clicked and
   * did not take, and the page they need to see that against stays mounted. The
   * reload after a successful write is a READ, so a failure there is a read
   * failure and reports through `loadError` like every other read: a list the
   * write has already invalidated must not stay on screen as fact.
   * @param providerId - the provider route id (the `providers` dict key).
   * @param modelId - the row to change, matched by `setVision`.
   * @param on - true declares `["text","image"]`, false removes the `input` key.
   */
  const toggle = useCallback(async (providerId: string, modelId: string, on: boolean) => {
    setBusy(true)
    try {
      const described = await api.settings.describe({})
      if (!described.result.ok) {
        setWriteError(described.result.error.message)
        return
      }
      const view = described.result.value.namespaces.find(candidate => candidate.ns === SETTINGS_NAMESPACE)
      const provider = view === undefined
        ? undefined
        : readProviders(view.value).find(row => row.id === providerId)
      if (view === undefined || provider === undefined) {
        setWriteError(`Không tìm thấy provider "${providerId}" trong "${SETTINGS_NAMESPACE}"`)
        return
      }
      const response = await api.settings.mutate({
        ns: SETTINGS_NAMESPACE,
        ops: [{
          op: 'set',
          path: ['providers', providerId, 'models'],
          value: setVision(provider.models, modelId, on),
        }],
        expectedRevision: view.revision,
      })
      if (!response.result.ok) {
        setWriteError(response.result.error.code === 'settings-conflict'
          ? 'Cấu hình vừa bị thay đổi ở nơi khác. Thử lại.'
          : response.result.error.message)
        return
      }
      // The write landed; the note belongs to the previous attempt.
      setWriteError(null)
      await load()
    } catch (err) {
      setWriteError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }, [api, load])

  if (loadError !== null) {
    return (
      <div>
        <p>Không đọc được cấu hình model: {loadError}</p>
        <button type="button" onClick={() => { void load() }}>Thử lại</button>
      </div>
    )
  }

  const total = providers.reduce((sum, provider) => sum + provider.models.length, 0)
  // A route that declares no `models` serves the installed catalog and has no
  // row this page can state anything about, so it draws no section at all
  // rather than an empty heading.
  const declared = providers.filter(provider => provider.models.length > 0)

  return (
    <div>
      <p>Bật/tắt khả năng đọc ảnh cho từng model. Bật sẽ khai báo <code>input: [&quot;text&quot;,&quot;image&quot;]</code>.</p>
      {loading && <p>Đang tải…</p>}
      {!loading && !writable && <p>Cấu hình hiện chỉ cho đọc nên không lưu được thay đổi.</p>}
      {!loading && total === 0 && <p>Chưa có provider nào khai báo model trong <code>{SETTINGS_NAMESPACE}</code>.</p>}
      {/* A write failure names the write. It sits above the list it failed to
          change, and the list stays mounted so the user can see which row and
          click it again. */}
      {writeError !== null && <p>Không cập nhật được cấu hình model: {writeError}</p>}
      {declared.map(provider => {
        const rows = provider.models.filter(isAddressable)
        const skipped = provider.models.length - rows.length
        return (
          <section key={provider.id}>
            <h3>{provider.displayName ?? provider.id}</h3>
            {rows.map((model, index) => (
              // The key pairs the row's position with its id: `setVision` flips
              // every row whose id matches, so a malformed document may hold
              // duplicate ids and the position is what stays unique.
              <label key={`${model.id}#${String(index)}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={hasVision(model)}
                  disabled={busy || !writable}
                  onChange={event => { void toggle(provider.id, model.id, event.target.checked) }}
                />
                <span>{model.name ?? model.id}</span>
              </label>
            ))}
            {skipped > 0 && <p>{skipped} model thiếu id nên bỏ qua.</p>}
          </section>
        )
      })}
    </div>
  )
}
