import type { FileUploadResponse, UploadListResponse, VisionCheckResponse } from '../types.js';
export declare function getSessionShortTag(sessionId: string): string;
export declare function cleanDisplayName(fileName: string): string;
export declare function buildSessionUploadFileName(sessionId: string, fileName: string): string;
export declare function formatFileSize(bytes: number): string;
export declare function generateDraftPrompt(items: Array<{
    relativePath: string;
    isPhoto: boolean;
}>): string;
export declare function checkModelVision(sessionId: string): Promise<VisionCheckResponse>;
export declare function resolveWorkspaceDir(sessionId: string): Promise<string | null>;
export declare function pickFilesFromBrowser(accept: string, multiple?: boolean): Promise<File[]>;
/**
 * If an image is larger than 4.5MB, downscale and re-compress to JPEG
 * so it stays safely under DSH's 5,242,880-byte tool limit.
 */
export declare function optimizeImageIfNeeded(file: File): Promise<File>;
export declare function fileToBase64(file: File): Promise<string>;
export declare function uploadSingleFile(sessionId: string, workspaceDir: string | null, file: File, isPhoto: boolean): Promise<FileUploadResponse>;
export declare function uploadMultipleFiles(sessionId: string, files: File[], isPhoto: boolean): Promise<FileUploadResponse[]>;
export declare function fetchUploadedFiles(sessionId: string): Promise<UploadListResponse>;
export declare function insertPromptIntoComposer(prompt: string): void;
