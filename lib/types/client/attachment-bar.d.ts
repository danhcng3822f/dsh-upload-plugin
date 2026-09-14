export interface SessionUploadRecord {
    id: string;
    name: string;
    relativePath: string;
    size: number;
    isPhoto: boolean;
    previewUrl?: string;
    uploadedAt: number;
}
export declare function getSessionUploads(sessionId: string): SessionUploadRecord[];
export declare function saveSessionUpload(sessionId: string, item: SessionUploadRecord): void;
export declare function saveMultipleSessionUploads(sessionId: string, items: SessionUploadRecord[]): void;
export declare function detectActiveSessionId(): string | null;
export declare function getDraftAttachments(sessionId?: string): SessionUploadRecord[];
export declare function addDraftAttachments(sessionId: string, newItems: SessionUploadRecord[]): void;
export declare function removeDraftAttachment(id: string): void;
export declare function clearDraftAttachments(sessionId?: string): void;
/**
 * DeepSeek Harness native-styled Image Lightbox
 */
export declare function openImageLightbox(imageUrl: string, title: string): void;
/**
 * Render attachment rail directly inside [data-composer-card="true"]
 * scoped strictly to the current session.
 */
export declare function renderAttachmentBar(targetSessionId?: string): void;
