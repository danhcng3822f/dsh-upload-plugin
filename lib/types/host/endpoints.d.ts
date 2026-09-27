import type { FileUploadResponse, ReadRefsResponse, SyncRefsResponse, UploadListResponse, VisionCheckResponse } from '../types.js';
export declare function handleCheckVision(llm: any, provider?: string, model?: string): Promise<VisionCheckResponse>;
export declare function handleUpload(workspaceDir: string, originalName: string, base64Data: string, isPhoto: boolean, sessionId?: string): Promise<FileUploadResponse>;
export declare function handleListUploads(workspaceDir: string, sessionId?: string): Promise<UploadListResponse>;
/**
 * Record which attachments are live in one session's draft (R25-B2).
 *
 * The client is the only side that knows this — the chips live in its composer
 * draft — so it pushes the set here whenever it changes, and the
 * `agent/pre-step` injection claims it on the next turn
 * (`src/host/context-injection.ts`).
 *
 * The body is untrusted by shape even though it comes from this plugin's own
 * client: a malformed row would otherwise reach `instructionFor` and render
 * `undefined` into the model's context. Rows that do not validate are dropped
 * rather than failing the whole push, because a partially-recognized set still
 * points the model at the attachments it can name, while a rejected push would
 * silently lose all of them.
 *
 * `reason` (R31) is what makes an empty set decidable — a committed send keeps
 * the held refs for the turn about to run, a removal clears them — and it is
 * parsed with the same leniency: an absent or unknown value falls back to the
 * behaviour an older client relied on (`parsePushReason`).
 * @param payload - the parsed request body.
 * @returns the outcome, with the count the host now holds for the session.
 */
export declare function handleSyncRefs(payload: unknown): Promise<SyncRefsResponse>;
/**
 * Read the host's view of one session's refs (R29, log added in R31).
 *
 * The write half — `handleSyncRefs` — answers only "how many do you hold now",
 * which is not enough to tell a failed push from a failed injection after the
 * fact. This is the read half: the held set, its spent flag, and the last pushes
 * that produced them, so one request after a send says which half of the feature
 * broke — including the case where the client pushed an empty set on purpose.
 *
 * It is total rather than validating: a missing or unknown `sessionId` answers
 * the empty, unspent set with no pushes, and the echoed `sessionId` is what tells
 * the caller the parameter arrived. A 400 here would be one more thing to decode
 * while diagnosing, which is the cost this endpoint exists to remove.
 * @param sessionId - the session from the query string, or undefined when absent.
 * @returns what the store holds for that session right now.
 */
export declare function handleReadRefs(sessionId: string | undefined): Promise<ReadRefsResponse>;
export declare function handleViewFile(workspaceDir: string, relFile: string): Promise<{
    found: boolean;
    buffer?: Buffer;
    contentType?: string;
    error?: string;
}>;
