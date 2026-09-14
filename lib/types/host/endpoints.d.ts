import type { FileUploadResponse, UploadListResponse, VisionCheckResponse } from '../types.js';
export declare function handleCheckVision(llm: any, provider?: string, model?: string): Promise<VisionCheckResponse>;
export declare function handleUpload(workspaceDir: string, originalName: string, base64Data: string, isPhoto: boolean, sessionId?: string): Promise<FileUploadResponse>;
export declare function handleListUploads(workspaceDir: string, sessionId?: string): Promise<UploadListResponse>;
export declare function handleViewFile(workspaceDir: string, relFile: string): Promise<{
    found: boolean;
    buffer?: Buffer;
    contentType?: string;
    error?: string;
}>;
