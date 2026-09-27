import { type SettingsApi } from './document.js';
/** The subset of the connection's wire face this page calls. */
export interface VisionSectionApi {
    settings: SettingsApi;
}
export interface VisionSectionProps {
    api: VisionSectionApi;
    /**
     * Register the page's reload with the plugin's `settings/document-updated`
     * subscription, which fires when the document changes somewhere else (the
     * shipped Models page, another tab, a hand edit). Returns the disposer.
     * @param reload - called with no arguments when the document changed.
     * @returns the unsubscribe function.
     */
    onDocumentUpdated(reload: () => void): () => void;
}
export declare function VisionSection({ api, onDocumentUpdated }: VisionSectionProps): import("react").JSX.Element;
