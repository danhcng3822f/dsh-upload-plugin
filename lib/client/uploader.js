export function getSessionShortTag(sessionId) {
    if (!sessionId)
        return 'common';
    return sessionId.replace(/^session-/, '').slice(0, 8);
}
export function cleanDisplayName(fileName) {
    return fileName.replace(/^session_[a-zA-Z0-9_-]+__/, '');
}
export function buildSessionUploadFileName(sessionId, fileName) {
    const tag = getSessionShortTag(sessionId);
    return `session_${tag}__${fileName}`;
}
export function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function generateDraftPrompt(items) {
    if (items.length === 0)
        return '';
    const allPhotos = items.every(i => i.isPhoto);
    if (allPhotos) {
        if (items.length === 1) {
            return `Tôi vừa tải lên ảnh \`${items[0].relativePath}\`. Bạn hãy gọi tool \`read_image\` để xem và phân tích ảnh này nhé: `;
        }
        const list = items.map(i => `- \`${i.relativePath}\``).join('\n');
        return `Tôi vừa tải lên ${items.length} ảnh sau:\n${list}\nBạn hãy gọi tool \`read_image\` lần lượt để xem và phân tích các ảnh này nhé: `;
    }
    const allFiles = items.every(i => !i.isPhoto);
    if (allFiles) {
        if (items.length === 1) {
            return `Tôi vừa tải lên file \`${items[0].relativePath}\`. Bạn hãy đọc nội dung file này (dùng tool \`read\` hoặc tool đọc file phù hợp) và hỗ trợ tôi: `;
        }
        const list = items.map(i => `- \`${i.relativePath}\``).join('\n');
        return `Tôi vừa tải lên ${items.length} file sau:\n${list}\nBạn hãy đọc nội dung các file này (dùng tool \`read\` hoặc tool đọc file phù hợp) và hỗ trợ tôi: `;
    }
    // Mixed items
    const list = items.map(i => `- \`${i.relativePath}\` (${i.isPhoto ? 'ảnh' : 'file'})`).join('\n');
    return `Tôi vừa tải lên các tệp sau:\n${list}\nBạn hãy đọc/xem nội dung các tệp này và hỗ trợ tôi: `;
}
export async function checkModelVision(sessionId) {
    try {
        let provider = '';
        let model = '';
        // Query current session model via DSH RPC
        try {
            const modelRes = await fetch('/api/session.models', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'client-request',
                    rpcId: `vision-check-${Date.now()}`,
                    method: 'session.models',
                    payload: { sessionId },
                }),
            });
            if (modelRes.ok) {
                const data = await modelRes.json();
                const current = data?.result?.value?.current;
                if (current?.provider && current?.model) {
                    provider = current.provider;
                    model = current.model;
                }
            }
        }
        catch {
            // Ignore RPC error, fallback to query without params
        }
        const query = new URLSearchParams();
        query.set('sessionId', sessionId);
        if (provider)
            query.set('provider', provider);
        if (model)
            query.set('model', model);
        const res = await fetch(`/api/vision-plugin/check-vision?${query.toString()}`);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        return await res.json();
    }
    catch (err) {
        return {
            hasVision: true, // Optimistic fallback if network request fails
        };
    }
}
export async function resolveWorkspaceDir(sessionId) {
    try {
        const res = await fetch('/api/workspace.list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'client-request',
                rpcId: `ws-resolve-${Date.now()}`,
                method: 'workspace.list',
                payload: {},
            }),
        });
        if (res.ok) {
            const data = await res.json();
            const items = data?.result?.value?.items;
            const match = items?.find(item => item.sessionIds?.includes(sessionId));
            if (match?.path)
                return match.path;
            if (items?.[0]?.path)
                return items[0].path;
        }
    }
    catch {
        // Ignore RPC error
    }
    return null;
}
export function pickFilesFromBrowser(accept, multiple = true) {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.multiple = multiple;
        input.style.display = 'none';
        input.onchange = () => {
            const files = Array.from(input.files ?? []);
            document.body.removeChild(input);
            resolve(files);
        };
        input.oncancel = () => {
            document.body.removeChild(input);
            resolve([]);
        };
        document.body.appendChild(input);
        input.click();
    });
}
/**
 * If an image is larger than 4.5MB, downscale and re-compress to JPEG
 * so it stays safely under DSH's 5,242,880-byte tool limit.
 */
export async function optimizeImageIfNeeded(file) {
    if (!file.type.startsWith('image/') || file.size <= 4.5 * 1024 * 1024) {
        return file;
    }
    try {
        const bitmap = await createImageBitmap(file);
        const maxDim = 2048;
        let width = bitmap.width;
        let height = bitmap.height;
        if (width > maxDim || height > maxDim) {
            if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
            }
            else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
            }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return file;
        ctx.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise(res => {
            canvas.toBlob(res, 'image/jpeg', 0.88);
        });
        if (!blob)
            return file;
        const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], newName, { type: 'image/jpeg' });
    }
    catch {
        return file;
    }
}
export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result;
            const commaIndex = result.indexOf(',');
            resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
export async function uploadSingleFile(sessionId, workspaceDir, file, isPhoto) {
    const readyFile = isPhoto ? await optimizeImageIfNeeded(file) : file;
    const fileBase64 = await fileToBase64(readyFile);
    const targetUploadName = buildSessionUploadFileName(sessionId, readyFile.name);
    const res = await fetch('/api/vision-plugin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sessionId,
            workspaceDir: workspaceDir ?? undefined,
            fileName: targetUploadName,
            fileBase64,
            isPhoto,
        }),
    });
    if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
    }
    return await res.json();
}
export async function uploadMultipleFiles(sessionId, files, isPhoto) {
    const workspaceDir = await resolveWorkspaceDir(sessionId);
    return await Promise.all(files.map(file => uploadSingleFile(sessionId, workspaceDir, file, isPhoto)));
}
export async function fetchUploadedFiles(sessionId) {
    try {
        const workspaceDir = await resolveWorkspaceDir(sessionId);
        const query = new URLSearchParams();
        query.set('sessionId', sessionId);
        if (workspaceDir)
            query.set('workspaceDir', workspaceDir);
        const res = await fetch(`/api/vision-plugin/list?${query.toString()}`);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.files))
            return data;
        // Filter files strictly belonging to this session
        const tag = getSessionShortTag(sessionId);
        const sessionPrefix = `session_${tag}__`;
        const subfolderPrefix = `uploads/${sessionId}/`;
        const sessionFiles = data.files.filter(f => {
            const base = f.name;
            return base.startsWith(sessionPrefix) || f.relativePath.startsWith(subfolderPrefix);
        });
        return {
            ok: true,
            files: sessionFiles,
        };
    }
    catch (err) {
        return { ok: false, files: [], error: err?.message ?? 'Failed to list uploads' };
    }
}
export function insertPromptIntoComposer(prompt) {
    const textarea = document.querySelector('textarea[data-input-target], textarea');
    if (textarea) {
        const current = textarea.value;
        const newText = current ? `${current}\n${prompt}` : prompt;
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
            nativeSetter.call(textarea, newText);
        }
        else {
            textarea.value = newText;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
    }
}
