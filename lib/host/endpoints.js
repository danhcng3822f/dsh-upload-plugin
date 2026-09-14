import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, normalize, relative, resolve } from 'node:path';
import { isSupportedPhotoExtension, resolveUniqueUploadPath } from './file-utils.js';
export async function handleCheckVision(llm, provider, model) {
    if (!provider || !model) {
        return {
            hasVision: false,
            reason: 'No active provider/model identified for current session',
        };
    }
    if (!llm || typeof llm.resolveModelInfo !== 'function') {
        return {
            hasVision: true, // Fallback if llm service not introspectable
            provider,
            model,
        };
    }
    try {
        const info = await llm.resolveModelInfo(provider, model);
        const modalities = info.inputModalities ?? ['text'];
        const hasVision = modalities.includes('image');
        return {
            hasVision,
            provider,
            model,
            reason: hasVision ? undefined : `Model "${model}" does not declare image input modality`,
        };
    }
    catch (err) {
        return {
            hasVision: false,
            provider,
            model,
            reason: err?.message ?? 'Failed to query model info',
        };
    }
}
export async function handleUpload(workspaceDir, originalName, base64Data, isPhoto, sessionId) {
    try {
        const safeSessionId = sessionId ? sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
        const uploadsDir = safeSessionId
            ? join(workspaceDir, 'uploads', safeSessionId)
            : join(workspaceDir, 'uploads');
        const targetPath = await resolveUniqueUploadPath(uploadsDir, originalName);
        const buffer = Buffer.from(base64Data, 'base64');
        await writeFile(targetPath, buffer);
        const finalName = basename(targetPath);
        const relPath = relative(workspaceDir, targetPath).replace(/\\/g, '/');
        return {
            ok: true,
            filename: finalName,
            relativePath: relPath,
            fullPath: targetPath,
            isPhoto,
        };
    }
    catch (err) {
        return {
            ok: false,
            error: err?.message ?? 'Failed to write upload file',
        };
    }
}
export async function handleListUploads(workspaceDir, sessionId) {
    try {
        const safeSessionId = sessionId ? sessionId.replace(/[^a-zA-Z0-9_-]/g, '_') : '';
        const uploadsDir = safeSessionId
            ? join(workspaceDir, 'uploads', safeSessionId)
            : join(workspaceDir, 'uploads');
        const entries = await readdir(uploadsDir, { withFileTypes: true }).catch(() => []);
        const files = [];
        for (const entry of entries) {
            if (entry.isFile()) {
                const fullPath = join(uploadsDir, entry.name);
                const st = await stat(fullPath).catch(() => null);
                if (!st)
                    continue;
                const isPhoto = isSupportedPhotoExtension(entry.name);
                const relPath = relative(workspaceDir, fullPath).replace(/\\/g, '/');
                files.push({
                    name: entry.name,
                    relativePath: relPath,
                    size: st.size,
                    mtime: Math.round(st.mtimeMs),
                    isPhoto,
                    viewUrl: `/api/vision-plugin/view?file=${encodeURIComponent(relPath)}`,
                });
            }
        }
        // Sort newest first
        files.sort((a, b) => b.mtime - a.mtime);
        return { ok: true, files };
    }
    catch (err) {
        return { ok: false, files: [], error: err?.message ?? 'Failed to list uploads' };
    }
}
const MIME_MAP = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.pdf': 'application/pdf',
    '.md': 'text/markdown; charset=utf-8',
};
export async function handleViewFile(workspaceDir, relFile) {
    try {
        const safeRel = normalize(relFile).replace(/^(\.\.(\/|\\|$))+/, '');
        const targetPath = resolve(workspaceDir, safeRel);
        // Security check: must reside inside workspaceDir
        const relFromWs = relative(workspaceDir, targetPath);
        if (relFromWs.startsWith('..') || resolve(targetPath) !== targetPath) {
            return { found: false, error: 'Access denied' };
        }
        const data = await readFile(targetPath);
        const ext = extname(targetPath).toLowerCase();
        const contentType = MIME_MAP[ext] ?? 'application/octet-stream';
        return { found: true, buffer: data, contentType };
    }
    catch (err) {
        return { found: false, error: err?.message ?? 'File not found' };
    }
}
