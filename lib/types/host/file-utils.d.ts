export declare function isSupportedPhotoExtension(fileName: string): boolean;
export declare function cleanDisplayName(fileName: string): string;
export declare function fileExists(filePath: string): Promise<boolean>;
export declare function resolveUniqueUploadPath(uploadsDir: string, originalName: string): Promise<string>;
